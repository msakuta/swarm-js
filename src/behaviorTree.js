import { centerOfTriangleObj } from "./triangleUtils";

// For now, it's an ugly global table.
let blackBoard = {};

const SUSPEND = 2;

export class BehaviorNode{
    outputPort = [];
    inputPort = [];
    name = "Node";
    constructor(){
        this.parent = parent;
    }
    callTick(context){
        const {tree, resuming} = context;
        if(!resuming)
            tree.execStack.push(this);
        const result = this.tick(context);
        context.resuming = false;
        if(result === SUSPEND)
            return SUSPEND;
        tree.execStack.pop();
        return result;
    }
    tick(context){}
    resolveInputPort(value){
        if(value[0] === "{" && value[value.length-1] === "}"){
            return blackBoard[value.substr(1, value.length-2)];
        }
        else{
            return value;
        }
    }
    resolveOutputPort(portName, value){
        if(portName[0] === "{" && portName[portName.length-1] === "}"){
            blackBoard[portName.substr(1, portName.length-2)] = value;
        }
        else{
            blackBoard[portName] = value;
        }
    }

    /// enumerateChildren().length === 0 doesn't mean it's a leaf node.
    /// It could be a branch with 0 children. We would want to show connector
    /// if the node is non-leaf.
    isLeafNode(){
        return true;
    }
    enumerateChildren(){
        return [];
    }
    spliceChild(index, deleteCount, insert){
        return false;
    }
    clone(){
        let ret = Object.create(this.constructor.prototype);
        Object.getOwnPropertyNames(this).forEach(key => ret[key] = this[key]);
        return ret;
    }
}

export class SequenceNode extends BehaviorNode{
    constructor(children){
        super();
        this.name = "Sequence";
        this.children = children;
        this.state = 0;
    }
    tick(context){
        for(; this.state < this.children.length; this.state++){
            const result = this.children[this.state].callTick(context);
            if(result === SUSPEND)
                return SUSPEND;
            else if(!result){
                this.state = 0;
                return false;
            }
        }
        this.state = 0;
        return true;
    }
    isLeafNode(){
        return false;
    }
    enumerateChildren(){
        return this.children;
    }
    spliceChild(index, deleteCount, insert){
        if(insert)
            this.children.splice(index, deleteCount, insert);
        else
            this.children.splice(index, deleteCount);
        return true;
    }
    clone(){
        let ret = super.clone();
        ret.children = this.children.map(node => node.clone());
        return ret;
    }
}

export class ReactiveSequenceNode extends SequenceNode{
    constructor(children){
        super(children);
        this.name = "ReactiveSequence";
    }
    tick(context){
        for(; this.state < this.children.length; this.state++){
            const result = this.children[this.state].callTick(context);
            if(result === SUSPEND){
                this.state = 0;
                return SUSPEND;
            }
            else if(!result){
                this.state = 0;
                return false;
            }
        }
        this.state = 0;
        return true;
    }
}

export class ForceSuccessNode extends BehaviorNode{
    constructor(child){
        super();
        this.name = "ForceSuccess";
        this.child = child;
    }
    tick(context){
        const result = this.child.callTick(context);
        if(result === SUSPEND)
            return SUSPEND;
        return true;
    }
    isLeafNode(){
        return false;
    }
    enumerateChildren(){
        return [this.child];
    }
}

export class SetBlackboardNode extends BehaviorNode{
    constructor(value, output){
        super();
        this.name = "SetBlackboard";
        this.inputPort.push(value);
        this.outputPort.push(output);
    }
    tick({game, agent}){
        this.resolveOutputPort(this.outputPort[0], this.resolveInputPort(this.inputPort[0]));
    }
}

export class WaitNode extends BehaviorNode{
    constructor(duration){
        super();
        this.name = "Wait";
        this.inputPort.push(duration);
        this.timeLeft = this.resolveInputPort(this.inputPort[0]);
    }
    tick({game, agent}){
        if(0 < this.timeLeft){
            this.timeLeft--;
            return SUSPEND;
        }
        else{
            this.timeLeft = this.resolveInputPort(this.inputPort[0]);
            return true;
        }
    }
}

export class FindPathNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "FindPath";
        this.inputPort.push(target);
    }
    tick({game, agent}){
        agent.findPath(game, this.resolveInputPort(this.inputPort[0]));
        return true;
    }
}

export class GetNextNodePositionNode extends BehaviorNode{
    constructor(position){
        super();
        this.name = "GetNextNodePosition";
        this.outputPort.push(position);
    }
    tick({game, agent}){
        if(!agent.path || agent.path.length === 0)
            return false;
        const center = centerOfTriangleObj(game.triangulation, game.trianglePoints,
            agent.path[agent.path.length-1]);
        this.resolveOutputPort(this.outputPort[0], [center.x, center.y]);
        return true;
    }
}

export class MoveNode extends BehaviorNode{
    constructor(position){
        super();
        this.name = "Move";
        this.inputPort.push(position);
    }
    tick({game, agent}){
        if(this.inputPort[0]){
            agent.moveTo(game, this.resolveInputPort(this.inputPort[0]));
            return true;
        }
        else
            return false;
    }
}

export class FollowPathNode extends BehaviorNode{
    constructor(){
        super();
        this.name = "FollowPath";
    }
    tick({game, agent}){
        agent.followPath(game);
        return true;
    }
}

export class IfNode extends BehaviorNode{
    constructor(condition, then, elseNode){
        super();
        this.name = "If";
        this.children = [condition, then, elseNode];
        this.state = 0;
    }
    tick(context){
        switch(this.state){
            case 0:
                const conditionResult = this.children[0].callTick(context);
                if(conditionResult === SUSPEND)
                    return SUSPEND;
                else if(conditionResult)
                    this.state = 1;
            case 1:
                const thenResult = this.children[1] ? this.children[1].callTick(context) : true;
                if(thenResult === SUSPEND)
                    return SUSPEND;
                this.state = 2;
            case 2:
                const elseResult = this.children[2] ? this.children[2].callTick(context) : true;
                if(elseResult === SUSPEND)
                    return SUSPEND;
        }
        this.state = 0;
        return true;
    }
    isLeafNode(){
        return false;
    }
    enumerateChildren(){
        // Create a copy of children to avoid having length === 3 for returned array
        let ret = [this.children[0]];
        for(let i = 1; i < 3; i++){
            if(this.children[i])
                ret.push(this.children[i]);
        }
        return ret;
    }
    spliceChild(index, deleteCount, insert){
        // Allow adding more than 3 elements temporarily for moving
        if(insert)
            this.children.splice(index, deleteCount, insert);
        else
            this.children.splice(index, deleteCount);
        return true;
    }
    clone(){
        let ret = super.clone();
        ret.children = this.children.map(node => node ? node.clone() : undefined);
        return ret;
    }
}

export class IsTargetFoundNode extends BehaviorNode{
    constructor(){
        super();
        this.name = "IsTargetFound";
    }
    tick({game, agent}){
        return agent.target !== null;
    }
}

export class FindTargetNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "FindTarget";
        this.outputPort.push(target);
    }
    tick({game, agent}){
        this.resolveOutputPort(this.outputPort[0], agent.findEnemy(game));
        return true;
    }
}

export class GetTargetNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "GetTarget";
        this.outputPort.push(target);
    }
    tick({game, agent}){
        this.resolveOutputPort(this.outputPort[0], agent.target);
        return true;
    }
}

export class PrintEntityNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "PrintEntity";
        this.inputPort.push(target);
    }
    tick({game, agent}){
        console.log(this.resolveInputPort(this.inputPort[0]));
        return true;
    }
}

export class GetTargetPositionNode extends BehaviorNode{
    constructor(targetPos){
        super();
        this.name = "GetTargetPosition";
        this.outputPort.push(targetPos);
    }
    tick({game, agent}){
        if(!agent.target)
            return false;
        this.resolveOutputPort(this.outputPort[0], agent.target.pos);
        return true;
    }
}

export class ShootBulletNode extends BehaviorNode{
    constructor(targetPos){
        super();
        this.name = "ShootBullet";
        this.inputPort.push(targetPos);
    }
    tick({game, agent}){
        agent.shootBullet(game, this.resolveInputPort(this.inputPort[0]));
    }
}

export class BehaviorTree{
    constructor(rootNode){
        this.rootNode = rootNode;
        this.execStack = [];
    }
    tick(game, agent){
        if(this.execStack.length === 0){
            if(this.rootNode){
                this.rootNode.callTick({tree: this, resuming: false, game, agent});
            }
        }
        else{
            this.rootNode.callTick({tree: this, resuming: true, game, agent});
        }
    }
}