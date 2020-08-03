
// For now, it's an ugly global table.
let blackBoard = {};

export class BehaviorNode{
    outputPort = [];
    inputPort = [];
    constructor(parent){
        this.parent = parent;
    }
    tick(game, agent){}
}

export class SequenceNode extends BehaviorNode{
    constructor(parent, children){
        super(parent);
        this.children = children;
    }
    tick(game, agent){
        for(let child of this.children)
            child.tick(game, agent);
    }
}

export class FindPathNode extends BehaviorNode{
    constructor(parent){
        super(parent);
    }
    tick(game, agent){
        agent.findPath(game);
    }
}

export class MoveNode extends BehaviorNode{
    constructor(parent){
        super(parent);
    }
    tick(game, agent){
        agent.moveTo([50, 50]);
    }
}

export class IfNode extends BehaviorNode{
    constructor(parent, condition, then, elseNode){
        super(parent);
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
}

export class IsTargetFoundNode extends BehaviorNode{
    constructor(parent){
        super(parent);
    }
    tick(game, agent){
        return agent.target !== null;
    }
}

export class FindTargetNode extends BehaviorNode{
    constructor(parent){
        super(parent);
    }
    tick(game, agent){
        agent.findEnemy(game);
    }
}

export class GetTargetPositionNode extends BehaviorNode{
    constructor(parent, targetPos){
        super(parent);
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
    constructor(parent, targetPos){
        super(parent);
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