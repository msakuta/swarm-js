const $ = require('jquery');
require('konva');
const { perlin_noise_pixel } = require('./perlinNoise');
const MarchingSquaresJS = require('marchingsquares');
const simplify = require('simplify-js');
const Delaunator = require('delaunator');


const WIDTH = 500;
const HEIGHT = 500;
const FRAMERATE = 50;

function centerOfTriangle(v1, v2, v3){
    let ret = {};
    ["x", "y"].forEach(x => ret[x] = (v1[x] + v2[x] + v3[x]) / 3.);
    return ret;
}

function centerOfTriangleObj(triangulation, points, idx){
    return centerOfTriangle(
        points[triangulation.triangles[idx]],
        points[triangulation.triangles[idx+1]],
        points[triangulation.triangles[idx+2]]);
}

function sign(p1, p2, p3){
    return (p1[0] - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1[1] - p3.y);
}

function pointInTriangle(pt, v1, v2, v3){
    let d1 = sign(pt, v1, v2);
    let d2 = sign(pt, v2, v3);
    let d3 = sign(pt, v3, v1);

    let has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    let has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(has_neg && has_pos);
}

/// Returns triangle id (multiple of 3)
function findTriangleAt(game, point){
    let triangles = game.triangulation.triangles;
    let points = game.trianglePoints;
    for(let i = 0; i < triangles.length; i += 3){
        let [v1, v2, v3] = [points[triangles[i]],
            points[triangles[i + 1]],
            points[triangles[i + 2]]];
        if(pointInTriangle(point, v1, v2, v3)){
            return i;
        }
    }
    return -1;
}

let id_iter = 0;

class Agent{
    target = null;
    active = true;
    path = null;
    unreachables = {};
    constructor(pos, team){
        this.id = id_iter++;
        this.pos = pos;
        this.team = team;
    }

    update(game){
        // Forget about dead enemy
        if(this.target !== null && !this.target.active)
            this.target = null;

        if(this.target === null){
            let bestAgent = null;
            let bestDistance = 1e6;
            for(let a of game.agents){
                if(a.id in this.unreachables)
                    continue;
                if(a !== this && a.team !== this.team){
                    let distance = Math.sqrt(a.pos.map((x, i) => x - this.pos[i]).reduce((sum, x) => sum += x * x, 0));
                    if(distance < bestDistance){
                        bestAgent = a;
                        bestDistance = distance;
                    }
                }
            }

            if(bestAgent !== null){
                this.target = bestAgent;
            }
        }

        if(this.target !== null){
            let targetPos = this.target.pos;
            let delta = targetPos.map((x, i) => x - this.pos[i]);
            let distance = Math.sqrt(delta.reduce((sum, x) => sum += x * x, 0));

            // Shoot bullets
            if(distance < 100. && Math.random() < 0.05){
                let bullet = {
                    pos: this.pos,
                    velo: delta.map(x => 3. * x / distance),
                    team: this.team,
                };

                game.bullets.push(bullet);

                let circle = new Konva.Circle({
                    x: bullet.pos[0] * WIDTH / game.xs,
                    y: bullet.pos[1] * HEIGHT / game.ys,
                    radius: 3,
                    fill: this.team === false ? 'white' : 'purple',
                    stroke: 'yellow',
                    strokeWidth: 0.1
                });
                agentLayer.add(circle);
                bullet.shape = circle;
            }

            this.findPath(game);
            let followPath = false;
            if(this.path && 0 < this.path.length){
                const center = centerOfTriangleObj(game.triangulation, game.trianglePoints,
                    this.path[this.path.length-1]);
                targetPos = [center.x, center.y];
                delta = targetPos.map((x, i) => x - this.pos[i]);
                distance = Math.sqrt(delta.reduce((sum, x) => sum += x * x, 0));
                followPath = true;
            }
            if(5. < distance || followPath){
                const speed = 1.;
                let newpos = distance <= speed ? targetPos :
                    this.pos.map((x, i) => x + speed * delta[i] / distance /*Math.random() - 0.5*/);
                if(game.isPassableAt(newpos)){
                    this.pos = newpos;
                    this.shape.x( this.pos[0] * WIDTH / game.xs);
                    this.shape.y( this.pos[1] * HEIGHT / game.ys);
                }
            }
            else if(followPath){
                this.path.pop();
            }
            this.pathLine.visible(true);
        }
        else{
            this.pathLine.visible(false);
        }
    }

    findPath(game){
        if(this.target){
            const thisTriangle = findTriangleAt(game, this.pos);
            const targetTriangle = findTriangleAt(game, this.target.pos);
            if(thisTriangle === targetTriangle || thisTriangle < 0 || targetTriangle < 0){
                this.pathLine.points([
                    this.pos[0] * WIDTH / game.xs,
                    this.pos[1] * HEIGHT / game.ys,
                    this.target.pos[0] * WIDTH / game.xs,
                    this.target.pos[1] * HEIGHT / game.ys,
                ]);
                return;
            }
            let costmap = new Array(Math.floor(game.triangulation.triangles.length / 3)).fill(Infinity);
            let cameFrom = new Array(Math.floor(game.triangulation.triangles.length / 3)).fill(-1);
            costmap[Math.floor(thisTriangle / 3)] = 0.;
            let openSet = [];
            openSet.push(thisTriangle);
            topLabel: while(0 < openSet.length){
                let top = openSet[0];
                openSet.splice(0, 1);
                const centerTop = centerOfTriangleObj(game.triangulation, game.trianglePoints, top);
                const topCost = costmap[Math.floor(top / 3)];
                for(let j = 0; j < 3; j++){
                    let nextTriangle = game.triangulation.halfedges[top + j];
                    if(nextTriangle < 0 || !game.trianglesPassable[Math.floor(nextTriangle / 3)])
                        continue;
                    if(isFinite(costmap[Math.floor(nextTriangle / 3)]) && costmap[Math.floor(nextTriangle / 3)] < topCost)
                        continue;
                    const centerNext = centerOfTriangleObj(game.triangulation, game.trianglePoints, Math.floor(nextTriangle / 3) * 3);
                    const delta = ["x", "y"].map(x => (centerTop[x] - centerNext[x]) * (centerTop[x] - centerNext[x]));
                    const dist = Math.sqrt(delta[0] + delta[1]);
                    if(costmap[Math.floor(nextTriangle / 3)] < topCost + dist)
                        continue;
                    costmap[Math.floor(nextTriangle / 3)] = topCost + dist;
                    cameFrom[Math.floor(nextTriangle / 3)] = top;
                    openSet.push(Math.floor(nextTriangle / 3) * 3);
                    if(Math.floor(nextTriangle / 3) * 3 === targetTriangle)
                        break topLabel;
                }
            }
            if(0 <= cameFrom[Math.floor(targetTriangle / 3)]){
                this.path = [];
                let plotPath = [
                    this.target.pos[0] * WIDTH / game.xs,
                    this.target.pos[1] * HEIGHT / game.ys,
                ];
                for(let traverser = targetTriangle; traverser != thisTriangle && 0 < traverser;
                    traverser = cameFrom[Math.floor(traverser / 3)])
                {
                    const center = centerOfTriangleObj(game.triangulation, game.trianglePoints, traverser);
                    plotPath.push(
                        center.x * WIDTH / game.xs,
                        center.y * HEIGHT / game.ys,
                    );
                    this.path.push(traverser);
                }
                plotPath.push(
                    this.pos[0] * WIDTH / game.xs,
                    this.pos[1] * HEIGHT / game.ys,
                );
                this.pathLine.points(plotPath);
            }
            else{
                this.unreachables[this.target.id] = true;
                this.target = null;
            }
        }
    }
}

let minimapCanvas;
let minimap;
let stage;
let rootLayer;
let game = new function(){
    this.xs = 100;
    this.ys = 100;
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
        return 0 <= triangle;
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

    for (let i = 0; i < triangles.length; i += 3) {
        let strTriangle = "M";
        [
            allPoints[triangles[i]],
            allPoints[triangles[i + 1]],
            allPoints[triangles[i + 2]]
        ].forEach(v => {strTriangle += v.x + "," + v.y + "L"});
        let triangle = new Konva.Path({
            x: 0.5 * stage.width() / game.xs,
            y: 0.5 * stage.height() / game.ys,
            data: strTriangle,
            stroke: 'rgba(1, 0, 1, 0.5)',
            strokeWidth: 0.2,
            fill: null,
            scaleX: stage.width() / game.xs,
            scaleY: stage.height() / game.ys
        });
        triangleLayer.add(triangle);
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

    agentLayer = new Konva.Group();
    foregroundLayer.add(agentLayer);
    stage.add(foregroundLayer);
    foregroundLayer.moveToTop();

    genImage();

    function frameProc(){
        game.animate();
        setTimeout(frameProc, FRAMERATE);
    }
    setTimeout(frameProc, FRAMERATE);
})
