const $ = require('jquery');
require('konva');
const { perlin_noise_pixel } = require('./perlinNoise');
const MarchingSquaresJS = require('marchingsquares');
const simplify = require('simplify-js');
const Delaunator = require('delaunator');


const WIDTH = 500;
const HEIGHT = 500;
const FRAMERATE = 50;

let minimapCanvas;
let minimap;
let stage;
let rootLayer;
let game = new function(){
    this.xs = 150;
    this.ys = 150;
    this.board = new Array(this.xs * this.ys);
    for(let xi = 0; xi < this.xs; xi++){
        for(let yi = 0; yi < this.ys; yi++){
            let dx = xi - this.xs / 2;
            let dy = yi - this.ys / 2;
            this.board[xi + yi * this.xs] = 
                0. + (Math.max(0, perlin_noise_pixel(xi, yi, 4) - Math.sqrt(dx * dx + dy * dy) / this.xs) > 0.1);
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
            ).filter(([_, count]) => count < 20).forEach(([team, count]) => {
                console.log(`filtered in [${team}]: ${count}`);
                let pos;
                for(let i = 0; i < 100; i++){
                    pos = [Math.random() * this.xs, Math.random() * this.ys];
                    if(1 === this.cellAt(pos[0], pos[1]))
                        break;
                }
                let agent = {
                    pos,
                    team,
                    target: null,
                    active: true,
                };
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
                            agent.shape.remove();
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
            // Forget about dead enemy
            if(agent.target !== null && !agent.target.active)
                agent.target = null;

            if(agent.target === null){
                let bestAgent = null;
                let bestDistance = 1e6;
                for(let a of this.agents){
                    if(a !== agent && a.team !== agent.team){
                        let distance = Math.sqrt(a.pos.map((x, i) => x - agent.pos[i]).reduce((sum, x) => sum += x * x, 0));
                        if(distance < bestDistance){
                            bestAgent = a;
                            bestDistance = distance;
                        }
                    }
                }

                if(bestAgent !== null){
                    agent.target = bestAgent;
                }
            }

            if(agent.target !== null){
                let delta = agent.target.pos.map((x, i) => x - agent.pos[i]);
                let distance = Math.sqrt(delta.reduce((sum, x) => sum += x * x, 0));

                // Shoot bullets
                if(distance < 100. && Math.random() < 0.05){
                    let bullet = {
                        pos: agent.pos,
                        velo: delta.map(x => 3. * x / distance),
                        team: agent.team,
                    };

                    this.bullets.push(bullet);

                    let circle = new Konva.Circle({
                        x: bullet.pos[0] * WIDTH / this.xs,
                        y: bullet.pos[1] * HEIGHT / this.ys,
                        radius: 3,
                        fill: agent.team === false ? 'white' : 'purple',
                        stroke: 'yellow',
                        strokeWidth: 0.1
                    });
                    agentLayer.add(circle);
                    bullet.shape = circle;
                }

                if(5. < distance){
                    let newpos = agent.pos.map((x, i) => x + 1 * delta[i] / distance /*Math.random() - 0.5*/);
                    if(1 === this.cellAt(newpos[0], newpos[1])){
                        agent.pos = newpos;
                        agent.shape.x( agent.pos[0] * WIDTH / this.xs);
                        agent.shape.y( agent.pos[1] * HEIGHT / this.ys);
                    }
                }
            }
        }
        agentLayer.draw();
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

        // draw the image
        backgroundLayer.draw();
    };
}

let agentLayer;
let borderLayer;
let triangleLayer;

function toggleTriangulation(){
    let isVisible = $('#triangulationVisible').get()[0].checked;
    if(borderLayer)
        borderLayer.visible(isVisible);
    if(triangleLayer)
        triangleLayer.visible(isVisible);
}

window.addEventListener('load', () => {
    $('#triangulationVisible').on('change', toggleTriangulation);

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

    backgroundLayer = new Konva.Layer();
    stage.add(backgroundLayer);

    borderLayer = new Konva.Layer();
    triangleLayer = new Konva.Layer();

    let lines = MarchingSquaresJS.isoLines(game.boardAs2DArray(x => 1 - x), 0.5);
    let allPoints = [];
    for(let line of lines){
        let simpleLine = simplify(line.map(p => ({x: p[0], y: p[1]})), 0.5, false);
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
    let { triangles } = Delaunator.from(allPoints, p => p.x, p => p.y);

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
    }

    // Draw triangles below borders
    stage.add(triangleLayer);
    stage.add(borderLayer);

    agentLayer = new Konva.Layer();
    stage.add(agentLayer);

    // draw the image
    borderLayer.draw();
    triangleLayer.draw();

    genImage();

    function frameProc(){
        game.animate();
        setTimeout(frameProc, FRAMERATE);
    }
    setTimeout(frameProc, FRAMERATE);
})
