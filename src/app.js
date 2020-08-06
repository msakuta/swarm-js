const $ = require('jquery');
require('konva');
const { perlin_noise_pixel } = require('./perlinNoise');
const MarchingSquaresJS = require('marchingsquares');
const simplify = require('simplify-js');
const Delaunator = require('delaunator');
import * as BT from "./behaviorTree";
import { centerOfTriangle, findTriangleAt, forEachTriangleEdge } from "./triangleUtils";
import { mainTree, Agent } from "./Agent";


const WIDTH = 500;
const HEIGHT = 500;
const FRAMERATE = 50;

let minimapCanvas;
let minimap;
let stage;
let game = new function(){
    // Pixel size of the occupancy grid
    this.xs = 100;
    this.ys = 100;

    // Canvas size
    this.WIDTH = WIDTH;
    this.HEIGHT = HEIGHT;

    this.board = new Array(this.xs * this.ys);
    for(let xi = 0; xi < this.xs; xi++){
        for(let yi = 0; yi < this.ys; yi++){
            let dx = xi - this.xs / 2;
            let dy = yi - this.ys / 2;
            this.board[xi + yi * this.xs] = 
                0. + (Math.max(0, perlin_noise_pixel(xi, yi, 3) - 0.5 * Math.sqrt(dx * dx + dy * dy) / this.xs) > 0.3);
        }
    }
    this.agents = [];
    this.bullets = [];

    this.cellAt = function(x, y){
        x = Math.round(x);
        y = Math.round(y);
        if(x < 0 || this.xs <= x || y < 0 || this.ys <= y)
            return 0;
        return this.board[x + y * this.xs];
    };

    this.isPassableAt = function(pos){
        const triangle = findTriangleAt(this, pos);
        return 0 <= triangle && this.trianglesPassable[triangle / 3];
    };

    this.boardAs2DArray = function(map){
        map = map || (x => x);
        let ret = [];
        for(let yi = 0; yi < this.ys; yi++){
            let row = [];
            for(let xi = 0; xi < this.xs; xi++)
                row.push(map(this.cellAt(xi, yi)));
            ret.push(row);
        }
        return ret;
    };

    this.animate = function(){
        // Spawn agents
        if(this.agents.length < 50){
            [0,1].map(team =>
                [team, this.agents.reduce((accum, a) => accum + (a.team === team), 0)]
            ).filter(([_, count]) => count < 10).forEach(([team, _]) => {
                let pos;
                let ok = false;
                for(let i = 0; i < 100; i++){
                    pos = [Math.random() * this.xs, Math.random() * this.ys];
                    if(1 !== this.cellAt(pos[0], pos[1]))
                        continue;
                    const triangle = findTriangleAt(this, pos);
                    if(triangle < 0 || !this.trianglesPassable[triangle / 3])
                        continue;
                    ok = true;
                    break;
                }
                // If we failed to find a position that is passable for 100 times, give up and try next time.
                if(!ok)
                    return;
                let agent = new Agent(pos, team);
                this.agents.push(agent);

                let circle = new Konva.Circle({
                    x: agent.pos[0] * WIDTH / this.xs,
                    y: agent.pos[1] * HEIGHT / this.ys,
                    radius: 5,
                    fill: agent.team === 0 ? 'blue' : 'red',
                    stroke: 'black',
                    strokeWidth: 0.5
                });
                agentLayer.add(circle);
                agent.shape = circle;

                let pathLine = new Konva.Line({
                    points: [
                        agent.pos[0] * WIDTH / this.xs,
                        agent.pos[1] * HEIGHT / this.ys
                    ],
                    stroke: agent.team === 0 ? 'blue' : 'red',
                    strokeWidth: 0.5,
                    dash: [5, 5],
                    visible: false,
                });
                pathLayer.add(pathLine);
                agent.pathLine = pathLine;
            });
        }

        // Animate bullets
        for(let i = 0; i < this.bullets.length;){
            let bullet = this.bullets[i];
            let newpos = bullet.pos.map((x, i) => x + bullet.velo[i]);
            let hit = (() => {
                for(let j = 0; j < this.agents.length; j++){
                    let agent = this.agents[j];
                    if(agent.team !== bullet.team){
                        let distance = Math.sqrt(agent.pos.map((x, i) => x - bullet.pos[i]).reduce((sum, x) => sum += x * x, 0));
                        if(distance < 5.){
                            agent.active = false;
                            this.agents.splice(j, 1);
                            agent.shape.destroy();
                            agent.pathLine.destroy();
                            return true;
                        }
                    }
                }
                return false;
            })();

            if(1 === this.cellAt(newpos[0], newpos[1]) && !hit){
                bullet.pos = newpos;
                bullet.shape.x( bullet.pos[0] * WIDTH / this.xs);
                bullet.shape.y( bullet.pos[1] * HEIGHT / this.ys);
                i++;
            }
            else{
                this.bullets.splice(i, 1);
                bullet.shape.remove();
            }
        }

        // Animate agents
        for(let agent of this.agents){
            agent.update(this);
        }
        foregroundLayer.draw();
    }
}();




function paintMinimap(y0,ys){
    var context = minimapCanvas.getContext("2d");
    var image = context.getImageData(0, y0, game.xs, ys);

    var pixels = game.xs * game.ys;
    var imageData = image.data; // here we detach the pixels array from DOM
    var land = [0, 127, 0],
        left = [0, 159, 0], right = [0, 91, 0], up = [0, 191, 0], down = [0, 63, 0],
        ocean = [14,39,214];
    var cols = [
        land, down, left, down,
        right, down, right, down,
        up, left, up, left,
        up, right, up, land
    ];
    for(var y = y0; y < y0 + ys; y++) for(var x = 0; x < game.xs; x++){
        var pixels = (y - y0) * game.xs + x;
        var col = [0, 127 * game.cellAt(x, y), 0];
        imageData[4*pixels+0] = col[0]; // Red value
        imageData[4*pixels+1] = col[1]; // Green value
        imageData[4*pixels+2] = col[2]; // Blue value
        imageData[4*pixels+3] = 255; // Alpha value
    }
//		image.data = imageData; // And here we attache it back (not needed cf. update)
    context.putImageData(image, 0, y0);
}

let backgroundLayer;
let foregroundLayer;

function genImage(){
    var image = new Image();
    image.src = minimapCanvas.toDataURL("image/png");
    image.onload = function(){
        minimap = new Konva.Image({
            x: 0,
            y: 0,
            image: image,
            width: WIDTH,
            height: HEIGHT
        });
        backgroundLayer.add(minimap);
        minimap.moveToBottom();

        // draw the image
        backgroundLayer.draw();
    };
}

let agentLayer;
let borderLayer;
let triangleLayer;
let connectionLayer;
let pathLayer;

function toggleTriangulation(){
    let isVisible = $('#triangulationVisible').get()[0].checked;
    if(borderLayer)
        borderLayer.visible(isVisible);
    if(triangleLayer)
        triangleLayer.visible(isVisible);
    backgroundLayer.draw();
}

function toggleConnection(){
    let isVisible = $('#connectionVisible').get()[0].checked;
    if(connectionLayer)
        connectionLayer.visible(isVisible);
    backgroundLayer.draw();
}

window.addEventListener('load', () => {
    $('#triangulationVisible').on('change', toggleTriangulation);
    $('#connectionVisible').on('change', toggleConnection);
    $('#pathVisible').on('change', () => {
        let isVisible = $('#pathVisible').get()[0].checked;
        if(pathLayer)
            pathLayer.visible(isVisible);
        // No need to explicitly redraw since the foreground is always redrawn
    });

    // Add hidden canvas dynamically to draw map image on,
    // because we want to have variable size.
    minimapCanvas = $("<canvas>", {
        "id": "minimap",
    })
    .attr({
        "width": game.xs + "px",
        "height": game.ys + "px",
    })
    .css("width", game.xs + "px")
    .css("height", game.ys + "px")
    .css("display", "none")
    .appendTo("#minimapContainer")
    .get()[0];

    paintMinimap(0, game.ys);

    // first we need to create a stage
    stage = new Konva.Stage({
        container: 'scratch',   // id of container <div>
        width: WIDTH,
        height: HEIGHT
    });


    // Draw triangles below borders
    backgroundLayer = new Konva.Layer();
    triangleLayer = new Konva.Group();
    backgroundLayer.add(triangleLayer);
    borderLayer = new Konva.Group();
    backgroundLayer.add(borderLayer);
    connectionLayer = new Konva.Group();
    backgroundLayer.add(connectionLayer);
    stage.add(backgroundLayer);

    foregroundLayer = new Konva.Layer();
    pathLayer = new Konva.Group();
    foregroundLayer.add(pathLayer);

    let lines = MarchingSquaresJS.isoLines(game.boardAs2DArray(x => 1 - x), 0.5);
    let allPoints = [];
    for(let line of lines){
        let simpleLine = simplify(line.map(p => ({x: p[0], y: p[1]})), 1, false);
        //console.log(`Simplified ${line.length} points to ${simpleLine.length} points`);
        // Don't bother adding polygons without area
        if(simpleLine.length <= 2)
            continue;
        let strLine = "M";
        for(let vertex of simpleLine)
            strLine += vertex.x + "," + vertex.y + "L";
        let polygon = new Konva.Path({
            x: 0.5 * stage.width() / game.xs,
            y: 0.5 * stage.height() / game.ys,
            data: strLine,
            stroke: 'red',
            strokeWidth: 0.4,
            fill: null,
            scaleX: stage.width() / game.xs,
            scaleY: stage.height() / game.ys
          });
          borderLayer.add(polygon);

        allPoints = allPoints.concat(simpleLine);
    }

    // allPoints.map(p => [p.x, p.y]) would work too, but we don't want a copy
    // of a big array.
    let triangulation = Delaunator.from(allPoints, p => p.x, p => p.y);
    game.trianglePoints = allPoints;
    let { triangles, halfedges } = game.triangulation = triangulation;
    game.trianglesPassable = [];

    forEachTriangleEdge(allPoints, triangulation, (_e, p, q) => {
        let edge = new Konva.Line({
            x: 0.5 * stage.width() / game.xs,
            y: 0.5 * stage.height() / game.ys,
            points: [p, q].reduce((list, v) => {
                list.push(v.x, v.y);
                return list;
            }, []),
            stroke: 'rgba(1, 0, 1, 0.5)',
            strokeWidth: 0.2,
            fill: null,
            scaleX: stage.width() / game.xs,
            scaleY: stage.height() / game.ys
        });
        triangleLayer.add(edge);
    });

    for (let i = 0; i < triangles.length; i += 3) {
        let thisCenter = centerOfTriangle(
            allPoints[triangles[i]],
            allPoints[triangles[i + 1]],
            allPoints[triangles[i + 2]]);

        for(let j = 0; j < 3; j++){
            if(halfedges[i + j] < 0)
                continue;
            let theOtherTriangle = Math.floor(halfedges[i + j] / 3) * 3;
            let theOtherCenter = centerOfTriangle(
                allPoints[triangles[theOtherTriangle]],
                allPoints[triangles[theOtherTriangle + 1]],
                allPoints[triangles[theOtherTriangle + 2]]);
            let triangleLine = new Konva.Line({
                points: [
                    thisCenter.x * WIDTH / game.xs,
                    thisCenter.y * HEIGHT / game.ys,
                    theOtherCenter.x * WIDTH / game.xs,
                    theOtherCenter.y * HEIGHT / game.ys,
                ],
                stroke: 'white',
                strokeWidth: 0.2,
                dash: [5, 5],
            });
            connectionLayer.add(triangleLine);
        }
    }

    (function checkPassableTriangles(){
        game.trianglesPassable = new Array(Math.floor(triangles.length / 3)).fill(0);
        const centerTriangle = findTriangleAt(game, [game.xs / 2, game.ys / 2]);
        if(0 <= centerTriangle){
            let connectedTriangles = {};
            connectedTriangles[centerTriangle] = true;
            let openSet = [centerTriangle];
            while(0 < openSet.length){
                let thisTriangle = openSet.pop();
                let thisCenter = centerOfTriangle(
                    allPoints[triangles[thisTriangle]],
                    allPoints[triangles[thisTriangle + 1]],
                    allPoints[triangles[thisTriangle + 2]]);
                if(!game.cellAt(thisCenter.x, thisCenter.y))
                    continue;
                game.trianglesPassable[Math.floor(thisTriangle / 3)] = 1;
                for(let j = 0; j < 3; j++){
                    if(halfedges[thisTriangle + j] < 0)
                        continue;
                    let theOtherTriangle = Math.floor(halfedges[thisTriangle + j] / 3) * 3;
                    if(!connectedTriangles.hasOwnProperty(theOtherTriangle)){
                        connectedTriangles[theOtherTriangle] = true;
                        openSet.push(theOtherTriangle);
                    }
                }
            }
        }
    })();

    game.agentLayer = agentLayer = new Konva.Group();
    foregroundLayer.add(agentLayer);
    stage.add(foregroundLayer);
    foregroundLayer.moveToTop();

    genImage();

    (function renderTree(){
        const ns = 'http://www.w3.org/2000/svg';
        const container = $("#treeContainer")[0];
        const svg = document.createElementNS(ns, "svg");
        svg.setAttributeNS(null, "width", 1000);
        svg.setAttributeNS(null, "height", 600);
        // Adding svg and nodes first and then adjust attributes may not be optimal in terms of DOM manipulation
        // and rendering, but we need it to compute text widths on the browser window.
        container.appendChild(svg);
        const svgInternal = document.createElementNS(ns, "g");
        svg.appendChild(svgInternal);

        const inputPorts = {};
        const outputPorts = {};

        function renderNode(node, offset, parent){
            const nodeElement = document.createElementNS(ns, "g");
            nodeElement.setAttributeNS(null, 'width', 100);
            nodeElement.setAttributeNS(null, 'height', 25);
            svgInternal.appendChild(nodeElement);
            if(parent){
                const parentConnector = document.createElementNS(ns, "path");
                parentConnector.setAttribute("d", `M${parent[0]} ${parent[1] + 25
                    }C${parent[0]} ${parent[1]+42.5
                    },${offset[0] + 60} ${offset[1]-12.5},${offset[0] + 60},${offset[1]}`);
                parentConnector.setAttribute("stroke-width", "2");
                parentConnector.setAttribute("stroke", "#ff0000");
                svgInternal.appendChild(parentConnector);
            }
            const rect = document.createElementNS(ns, "rect");
            rect.setAttributeNS(null, "class", "draggable");
            rect.setAttributeNS(null, 'width', 100);
            rect.setAttributeNS(null, 'height', 25 + (node.inputPort.length + node.outputPort.length) * 20);
            rect.setAttributeNS(null, 'fill', node instanceof BT.IfNode ? '#7f7f00' :
                node instanceof BT.SequenceNode ? '#007f00' : '#f06');
            nodeElement.appendChild(rect);
            const text = document.createElementNS(ns, "text");
            text.setAttribute('x', '10');
            text.setAttribute('y', '20');
            text.setAttribute('font-size','18');
            let nodeName = node.name;
            if(nodeName.substr(nodeName.length-4) === "Node")
                nodeName = nodeName.substr(0, nodeName.length-4);
            text.textContent = nodeName;
            text.setAttribute("class", "noselect");
            text.style.fill = "white";
            nodeElement.appendChild(text);
            const bbox = text.getBBox();
            let width = Math.max(100, bbox.width + 20);

            let y = 40;
            function addPort(name, textColor){
                const portText = document.createElementNS(ns, "text");
                portText.setAttribute('x', 10);
                portText.setAttribute('y', y);
                portText.setAttribute('font-size','16');
                portText.style.fill = textColor;
                portText.setAttribute("class", "noselect");
                portText.textContent = name;
                nodeElement.appendChild(portText);
                const bbox = portText.getBBox();
                width = Math.max(width, bbox.width + 20);
                const ret = y;
                y += 20;
                return ret;
            }

            function addPortConnector([x, y], connectorColor, portCollection, portName){
                const portConnector = document.createElementNS(ns, "rect");
                portConnector.setAttribute('x', x - 5);
                portConnector.setAttribute('y', y - 10);
                portConnector.setAttributeNS(null, 'width', 10);
                portConnector.setAttributeNS(null, 'height', 10);
                portConnector.setAttributeNS(null, 'fill', connectorColor);
                portConnector.setAttributeNS(null, 'stroke', 'black');
                nodeElement.appendChild(portConnector);
                if(portName){
                    if(!(portName in portCollection))
                        portCollection[portName] = [];
                    portCollection[portName].push({
                        elem: portConnector,
                        x: offset[0] + x,
                        y: offset[1] + y - 5,
                    });
                }
            }

            node.inputPort
                .map(portName => [addPort(portName || "IN", "#afafff"), portName])
                .forEach(([y, portName]) => addPortConnector([0, y], "#7f7fff", inputPorts, portName));
            node.outputPort
                .map(portName => [addPort(portName || "OUT", "#ffafaf"), portName])
                .forEach(([y, portName]) => addPortConnector([width, y], "#ff7f7f", outputPorts, portName));

            rect.setAttributeNS(null, "width", width);

            nodeElement.setAttribute("transform", `translate(${offset[0]}, ${offset[1]})`);

            return [width, y];
        }

        function renderSubTree(node, offset, parent){
            const children = node.enumerateChildren();
            const thisSize = renderNode(node, offset, parent);
            const x = offset[0];
            const parentPos = [offset[0] + 60, offset[1]];
            let maxHeight = thisSize[1];
            for(let i = 0; i < children.length; i++){
                const [width, height] = renderSubTree(children[i], [offset[0], offset[1] + 50], parentPos);
                offset[0] += width;
                maxHeight = Math.max(maxHeight, thisSize[1] + 10 + height);
            }
            return [Math.max(thisSize[0], offset[0] - x) + 20, maxHeight];
        }

        const size = renderSubTree(mainTree.rootNode, [20, 20]);

        for(let key in inputPorts){
            for(let inputPort of inputPorts[key]){
                if(key in outputPorts){
                    for(let outputPort of outputPorts[key]){
                        const portConnector = document.createElementNS(ns, "path")
                        portConnector.setAttribute("d", `M${inputPort.x} ${inputPort.y
                            }C${inputPort.x + 12.5} ${inputPort.y
                            },${outputPort.x - 12.5} ${outputPort.y},${outputPort.x},${outputPort.y}`);
                        portConnector.setAttribute("stroke-width", "2");
                        portConnector.setAttribute("stroke", "#7fff00");
                        svgInternal.appendChild(portConnector);
                    }
                }
            }
        }
        const scale = 0.75;
        // We cannot apply transform to svg element itself because Edge doesn't support it.
        svg.setAttribute("width", (size[0] + 20) * scale);
        svg.setAttribute("height", (size[1] + 20) * scale);
        svgInternal.setAttribute("transform", `scale(${scale})`);
    })();

    function frameProc(){
        game.animate();
        setTimeout(frameProc, FRAMERATE);
    }
    setTimeout(frameProc, FRAMERATE);
})
