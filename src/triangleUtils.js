export function centerOfTriangle(v1, v2, v3){
    let ret = {};
    ["x", "y"].forEach(x => ret[x] = (v1[x] + v2[x] + v3[x]) / 3.);
    return ret;
}

export function centerOfTriangleObj(triangulation, points, idx){
    return centerOfTriangle(
        points[triangulation.triangles[idx]],
        points[triangulation.triangles[idx+1]],
        points[triangulation.triangles[idx+2]]);
}

export function sign(p1, p2, p3){
    return (p1[0] - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1[1] - p3.y);
}

export function pointInTriangle(pt, v1, v2, v3){
    let d1 = sign(pt, v1, v2);
    let d2 = sign(pt, v2, v3);
    let d3 = sign(pt, v3, v1);

    let has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    let has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(has_neg && has_pos);
}

/// Returns triangle id (multiple of 3)
export function findTriangleAt(game, point){
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

