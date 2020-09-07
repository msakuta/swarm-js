import { centerOfTriangleObj } from "./triangleUtils";

const SUCCESS = 1;
const FAILURE = 0;
const RUNNING = 2;

export class BehaviorNode{
    outputPort = [];
    inputPort = [];
    name = "Node";
    callTick(context){
        const {tree, resuming} = context;
        if(!resuming)
            tree.execStack.push(this);
        const result = this.tick(context);
        context.resuming = false;
        if(result === RUNNING)
            return RUNNING;
        tree.execStack.pop();
        return result;
    }

    /// @returns SUCCESS, FAILURE or RUNNING
    tick(context){
        return SUCCESS;
    }
    resolveInputPort(value, blackBoard){
        if(typeof value === "string" && value[0] === "{" && value[value.length-1] === "}"){
            return blackBoard[value.substr(1, value.length-2)];
        }
        else{
            return value;
        }
    }
    resolveOutputPort(portName, value, blackBoard){
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
        return this.maximumChildren() === 0;
    }

    /// Some nodes have limited number of children, e.g. decorators have only 1, if nodes can have up to 3.
    /// We need this information to edit the tree in the graphical editor.
    maximumChildren(){
        return 0;
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
        this.children = children || [];
        this.state = 0;
    }
    tick(context){
        for(; this.state < this.children.length; this.state++){
            const result = this.children[this.state].callTick(context);
            if(result === RUNNING)
                return RUNNING;
            else if(result === FAILURE){
                this.state = 0;
                return FAILURE;
            }
        }
        this.state = 0;
        return SUCCESS;
    }
    isLeafNode(){
        return false;
    }
    maximumChildren(){
        return Infinity;
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
            if(result === RUNNING){
                this.state = 0;
                return RUNNING;
            }
            else if(result === FAILURE){
                this.state = 0;
                return FAILURE;
            }
        }
        this.state = 0;
        return SUCCESS;
    }
}

export class ForceSuccessNode extends BehaviorNode{
    constructor(child){
        super();
        this.name = "ForceSuccess";
        this.child = child;
    }
    tick(context){
        if(this.child){
            try{
                const result = this.child.callTick(context);
                if(result === RUNNING)
                    return RUNNING;
            }
            catch(err){
                console.log("ForceSuccessNode: " + err.message);
            }
        }
        return SUCCESS;
    }
    isLeafNode(){
        return false;
    }
    maximumChildren(){
        return 1;
    }
    enumerateChildren(){
        return this.child ? [this.child] : [];
    }
    spliceChild(index, count, node){
        if(index === 0 && this.child){
            if(count === 1)
                this.child = null;
            if(node)
                this.child = node;
        }
    }
}

export class SetBlackboardNode extends BehaviorNode{
    constructor(value, output){
        super();
        this.name = "SetBlackboard";
        this.inputPort.push(value);
        this.outputPort.push(output);
    }
    tick({blackBoard}){
        this.resolveOutputPort(this.outputPort[0], this.resolveInputPort(this.inputPort[0], blackBoard), blackBoard);
    }
}

export class WaitNode extends BehaviorNode{
    constructor(duration){
        super();
        this.name = "Wait";
        this.inputPort.push(duration);
        this.timeLeft = this.inputPort[0]; // should be resolveInputPort-ed in init()
    }
    tick({blackBoard}){
        if(0 < this.timeLeft){
            this.timeLeft--;
            return RUNNING;
        }
        else{
            this.timeLeft = this.resolveInputPort(this.inputPort[0], blackBoard);
            return SUCCESS;
        }
    }
}

export class FindPathNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "FindPath";
        this.inputPort.push(target);
    }
    tick({game, agent, blackBoard}){
        agent.findPath(game, this.resolveInputPort(this.inputPort[0], blackBoard));
        return SUCCESS;
    }
}

export class GetNextNodePositionNode extends BehaviorNode{
    constructor(position){
        super();
        this.name = "GetNextNodePosition";
        this.outputPort.push(position);
    }
    tick({game, agent, blackBoard}){
        if(!agent.path || agent.path.length === 0)
            return FAILURE;
        const center = centerOfTriangleObj(game.triangulation, game.trianglePoints,
            agent.path[agent.path.length-1]);
        this.resolveOutputPort(this.outputPort[0], [center.x, center.y], blackBoard);
        return SUCCESS;
    }
}

export class MoveNode extends BehaviorNode{
    constructor(position){
        super();
        this.name = "Move";
        this.inputPort.push(position);
    }
    tick({game, agent, blackBoard}){
        if(this.inputPort[0]){
            let position = this.resolveInputPort(this.inputPort[0], blackBoard);
            if(typeof position === "string"){
                try{
                    position = JSON.parse(position);
                }
                catch(e){
                    console.log("Error on parsing position: " + e.message);
                }
            }
            if(position instanceof Array && position.length == 2){
                agent.moveTo(game, position);
                return SUCCESS;
            }
            else
                return FAILURE;
        }
        else
            return FAILURE;
    }
}

export class FollowPathNode extends BehaviorNode{
    constructor(){
        super();
        this.name = "FollowPath";
    }
    tick({game, agent}){
        agent.followPath(game);
        return SUCCESS;
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
                if(conditionResult === RUNNING)
                    return RUNNING;
                else if(conditionResult)
                    this.state = 1;
            case 1:
                const thenResult = this.children[1] ? this.children[1].callTick(context) : true;
                if(thenResult === RUNNING)
                    return RUNNING;
                this.state = 2;
            case 2:
                const elseResult = this.children[2] ? this.children[2].callTick(context) : true;
                if(elseResult === RUNNING)
                    return RUNNING;
        }
        this.state = 0;
        return SUCCESS;
    }
    isLeafNode(){
        return false;
    }
    maximumChildren(){
        return 3;
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
    tick({game, agent, blackBoard}){
        this.resolveOutputPort(this.outputPort[0], agent.findEnemy(game), blackBoard);
        return SUCCESS;
    }
}

export class GetTargetNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "GetTarget";
        this.outputPort.push(target);
    }
    tick({game, agent, blackBoard}){
        this.resolveOutputPort(this.outputPort[0], agent.target, blackBoard);
        return SUCCESS;
    }
}

export class PrintEntityNode extends BehaviorNode{
    constructor(target){
        super();
        this.name = "PrintEntity";
        this.inputPort.push(target);
    }
    tick({blackBoard}){
        console.log(this.resolveInputPort(this.inputPort[0], blackBoard));
        return SUCCESS;
    }
}

export class GetTargetPositionNode extends BehaviorNode{
    constructor(targetPos){
        super();
        this.name = "GetTargetPosition";
        this.outputPort.push(targetPos);
    }
    tick({agent, blackBoard}){
        if(!agent.target)
            return FAILURE;
        this.resolveOutputPort(this.outputPort[0], agent.target.pos, blackBoard);
        return SUCCESS;
    }
}

export class ShootBulletNode extends BehaviorNode{
    constructor(targetPos){
        super();
        this.name = "ShootBullet";
        this.inputPort.push(targetPos);
    }
    tick({game, agent, blackBoard}){
        return agent.shootBullet(game, this.resolveInputPort(this.inputPort[0], blackBoard))
            ? SUCCESS : FAILURE;
    }
}

export const allNodeTypes = [
    SequenceNode,
    ReactiveSequenceNode,
    ForceSuccessNode,
    SetBlackboardNode,
    MoveNode,
    GetNextNodePositionNode,
    WaitNode,
    FindPathNode,
    FollowPathNode,
    IfNode,
    IsTargetFoundNode,
    FindTargetNode,
    GetTargetNode,
    PrintEntityNode,
    GetTargetPositionNode,
    ShootBulletNode,
];

export class BehaviorTree{
    constructor(rootNode){
        this.rootNode = rootNode;
        this.execStack = [];
        // Blackboard state is carried on to next tick. Is it desired behavior?
        this.blackBoard = {};
    }
    tick(game, agent){
        if(this.execStack.length === 0){
            if(this.rootNode){
                this.rootNode.callTick({tree: this, resuming: false, game, agent, blackBoard: this.blackBoard});
            }
        }
        else{
            this.rootNode.callTick({tree: this, resuming: true, game, agent, blackBoard: this.blackBoard});
        }
    }
}