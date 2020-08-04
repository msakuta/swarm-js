import { centerOfTriangleObj } from "./triangleUtils";

// For now, it's an ugly global table.
let blackBoard = {};

export class BehaviorNode{
    outputPort = [];
    inputPort = [];
    constructor(){
        this.parent = parent;
    }
    tick(game, agent){}
    enumerateChildren(){
        return [];
    }
}

export class SequenceNode extends BehaviorNode{
    constructor(children){
        super();
        this.children = children;
    }
    tick(game, agent){
        for(let child of this.children)
            child.tick(game, agent);
    }
    enumerateChildren(){
        return this.children;
    }
}

export class FindPathNode extends BehaviorNode{
    constructor(target){
        super();
        this.inputPort.push(target);
    }
    tick(game, agent){
        agent.findPath(game, blackBoard[this.inputPort[0]]);
        return true;
    }
}

export class GetNextNodePositionNode extends BehaviorNode{
    constructor(position){
        super();
        this.outputPort.push(position);
    }
    tick(game, agent){
        if(!agent.path || agent.path.length === 0)
            return false;
        const center = centerOfTriangleObj(game.triangulation, game.trianglePoints,
            agent.path[agent.path.length-1]);
        blackBoard[this.outputPort[0]] = [center.x, center.y];
        return true;
    }
}

export class MoveNode extends BehaviorNode{
    constructor(position){
        super();
        this.inputPort.push(position);
    }
    tick(game, agent){
        if(this.inputPort[0]){
            agent.moveTo(blackBoard[this.inputPort[0]]);
            return true;
        }
        else
            return false;
    }
}

export class IfNode extends BehaviorNode{
    constructor(condition, then, elseNode){
        super();
        this.condition = condition;
        this.then = then;
        this.elseNode = elseNode;
    }
    tick(game, agent){
        if(this.condition.tick(game, agent)){
            if(this.then)
                this.then.tick(game, agent);
        }
        else if(this.elseNode)
            this.elseNode.tick(game, agent);
    }
    enumerateChildren(){
        let ret = [this.condition];
        if(this.then)
            ret.push(this.then);
        if(this.elseNode)
            ret.push(this.elseNode);
        return ret;
    }
}

export class IsTargetFoundNode extends BehaviorNode{
    constructor(){
        super();
    }
    tick(game, agent){
        return agent.target !== null;
    }
}

export class FindTargetNode extends BehaviorNode{
    constructor(){
        super();
    }
    tick(game, agent){
        agent.findEnemy(game);
    }
}

export class GetTargetNode extends BehaviorNode{
    constructor(target){
        super();
        this.outputPort.push(target);
    }
    tick(game, agent){
        blackBoard[this.outputPort[0]] = agent.target;
        return true;
    }
}

export class GetTargetPositionNode extends BehaviorNode{
    constructor(targetPos){
        super();
        this.outputPort.push(targetPos);
    }
    tick(game, agent){
        if(!agent.target)
            return false;
        blackBoard[this.outputPort[0]] = agent.target.pos;
        return true;
    }
}

export class ShootBulletNode extends BehaviorNode{
    constructor(targetPos){
        super();
        this.inputPort.push(targetPos);
    }
    tick(game, agent){
        agent.shootBullet(game, blackBoard[this.inputPort[0]]);
    }
}

export class BehaviorTree{
    constructor(rootNode){
        this.rootNode = rootNode;
    }
    tick(game, agent){
        if(this.rootNode)
            this.rootNode.tick(game, agent);
    }
}