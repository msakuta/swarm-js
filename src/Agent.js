import { centerOfTriangleObj, findTriangleAt } from "./triangleUtils";
import * as BT from "./behaviorTree";

const buildMainTree = () => new BT.BehaviorTree(
    new BT.SequenceNode([
        new BT.FindTargetNode("{target}"),
        new BT.WaitNode(15),
        new BT.IfNode(new BT.FindPathNode("{target}"),
            new BT.SequenceNode([
                new BT.GetNextNodePositionNode("{nextNodePos}"),
                new BT.MoveNode("{nextNodePos}"),
            ])),
        new BT.IfNode(new BT.IsTargetFoundNode(),
            new BT.SequenceNode([
                // new BT.SequenceNode([
                //     new BT.PrintEntityNode("target"),
                // ]),
                new BT.GetTargetPositionNode("{enemyPos}"),
                new BT.ShootBulletNode("{enemyPos}"),
            ])),
    ]));

export let mainTree = buildMainTree();

let id_iter = 0;

export class Agent{
    target = null;
    active = true;
    path = null;
    unreachables = {};
    behaviorTree = new BT.BehaviorTree();
    constructor(pos, team){
        this.id = id_iter++;
        this.pos = pos;
        this.team = team;
        this.cooldown = 5;
        if(this.id % 1 === 0)
            this.behaviorTree = buildMainTree();
    }

    /// targetPos needs to be an array of 2 elements
    moveTo(game, targetPos){
        const speed = 1.;
        let delta = targetPos.map((x, i) => x - this.pos[i]);
        let distance = Math.sqrt(delta.reduce((sum, x) => sum += x * x, 0));
        let newpos = distance <= speed ? targetPos :
            this.pos.map((x, i) => x + speed * delta[i] / distance /*Math.random() - 0.5*/);
        if(game.isPassableAt(newpos)){
            this.pos = newpos;
            this.shape.x( this.pos[0] * game.WIDTH / game.xs);
            this.shape.y( this.pos[1] * game.HEIGHT / game.ys);
        }
    }

    findEnemy(game){
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
        return this.target;
    }

    shootBullet(game, targetPos){
        if(0 < this.cooldown)
            return false;
        let delta = targetPos.map((x, i) => x - this.pos[i]);
        let distance = Math.sqrt(delta.reduce((sum, x) => sum += x * x, 0));
        let bullet = {
            pos: this.pos,
            velo: delta.map(x => 3. * x / distance),
            team: this.team,
        };

        game.bullets.push(bullet);

        let circle = new Konva.Circle({
            x: bullet.pos[0] * game.WIDTH / game.xs,
            y: bullet.pos[1] * game.HEIGHT / game.ys,
            radius: 3,
            fill: this.team === false ? 'white' : 'purple',
            stroke: 'yellow',
            strokeWidth: 0.1
        });
        game.agentLayer.add(circle);
        bullet.shape = circle;
        this.cooldown += 5;
        return true;
    }

    update(game){
        if(this.behaviorTree.rootNode){
            this.behaviorTree.tick(game, this);
            if(0 < this.cooldown)
                this.cooldown--;
            return;
        }

        // Forget about dead enemy
        if(this.target !== null && !this.target.active)
            this.target = null;

        if(this.target === null){
            this.findEnemy(game);
        }

        if(this.target !== null){
            let targetPos = this.target.pos;
            let delta = targetPos.map((x, i) => x - this.pos[i]);
            let distance = Math.sqrt(delta.reduce((sum, x) => sum += x * x, 0));

            // Shoot bullets
            if(distance < 100. && Math.random() < 0.05){
                this.shootBullet(game, targetPos);
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
                    this.shape.x( this.pos[0] * game.WIDTH / game.xs);
                    this.shape.y( this.pos[1] * game.HEIGHT / game.ys);
                }
            }
            else if(followPath){
                this.path.pop();
            }
        }

        if(0 < this.cooldown)
            this.cooldown--;
    }

    findPath(game){
        if(this.target){
            const thisTriangle = findTriangleAt(game, this.pos);
            const targetTriangle = findTriangleAt(game, this.target.pos);
            if(thisTriangle === targetTriangle || thisTriangle < 0 || targetTriangle < 0){
                this.pathLine.points([
                    this.pos[0] * game.WIDTH / game.xs,
                    this.pos[1] * game.HEIGHT / game.ys,
                    this.target.pos[0] * game.WIDTH / game.xs,
                    this.target.pos[1] * game.HEIGHT / game.ys,
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
                    this.target.pos[0] * game.WIDTH / game.xs,
                    this.target.pos[1] * game.HEIGHT / game.ys,
                ];
                for(let traverser = targetTriangle; traverser != thisTriangle && 0 < traverser;
                    traverser = cameFrom[Math.floor(traverser / 3)])
                {
                    const center = centerOfTriangleObj(game.triangulation, game.trianglePoints, traverser);
                    plotPath.push(
                        center.x * game.WIDTH / game.xs,
                        center.y * game.HEIGHT / game.ys,
                    );
                    this.path.push(traverser);
                }
                plotPath.push(
                    this.pos[0] * game.WIDTH / game.xs,
                    this.pos[1] * game.HEIGHT / game.ys,
                );
                this.pathLine.points(plotPath);
                this.pathLine.visible(true);
            }
            else{
                this.unreachables[this.target.id] = true;
                this.target = null;
                this.pathLine.visible(false);
            }
        }
        else
            this.pathLine.visible(false);
    }
}
