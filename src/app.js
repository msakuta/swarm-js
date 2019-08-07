const $ = require('jquery');
require('konva');
const { perlin_noise_pixel } = require('./perlinNoise');
var MarchingSquaresJS = require('marchingsquares');

let minimapCanvas;
let minimap;
let stage;
let rootLayer;
let game = new function(){
    this.xs = 50;
    this.ys = 50;
    this.board = new Array(this.xs * this.ys);
    for(let xi = 0; xi < this.xs; xi++){
        for(let yi = 0; yi < this.ys; yi++){
            let dx = xi - 25;
            let dy = yi - 25;
            this.board[xi + yi * this.xs] = 
                0. + (Math.max(0, perlin_noise_pixel(xi, yi, 3) - Math.sqrt(dx * dx + dy * dy) / 50) > 0.1);
        }
    }

    this.cellAt = function(x, y){
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
        var col = [0, 255 * game.cellAt(x, y), 255];
        imageData[4*pixels+0] = col[0]; // Red value
        imageData[4*pixels+1] = col[1]; // Green value
        imageData[4*pixels+2] = col[2]; // Blue value
        imageData[4*pixels+3] = 255; // Alpha value
    }
//		image.data = imageData; // And here we attache it back (not needed cf. update)
    context.putImageData(image, 0, y0);
}

function genImage(){
    var image = new Image();
    image.src = minimapCanvas.toDataURL("image/png");
    image.onload = function(){
        minimap = new Konva.Image({
            x: 0,
            y: 0,
            image: image,
            width: 500,
            height: 500
        });
        stage.children[0].add(minimap);

        // draw the image
        stage.children[0].draw();
    };
}

window.addEventListener('load', () => {

    minimapCanvas = document.getElementById("minimap");

    paintMinimap(0, game.ys);

    // first we need to create a stage
    stage = new Konva.Stage({
        container: 'scratch',   // id of container <div>
        width: 500,
        height: 500
    });

    let firstLayer = new Konva.Layer();
    stage.add(firstLayer);

    let layer = new Konva.Layer();

    let lines = MarchingSquaresJS.isoLines(game.boardAs2DArray(x => 1 - x), 0.5);
    for(let line of lines){
        let strLine = "M";
        for(let vertex of line)
            strLine += vertex[0] + "," + vertex[1] + "L";
        let polygon = new Konva.Path({
            x: 0.5 * stage.width() / game.xs,
            y: 0.5 * stage.height() / game.ys,
            data: strLine,
            stroke: 'red',
            strokeWidth: 0.2,
            fill: null,
            scaleX: stage.width() / game.xs,
            scaleY: stage.height() / game.ys
          });
        layer.add(polygon);
    }
    stage.add(layer);

    // draw the image
    layer.draw();

    genImage();
})
