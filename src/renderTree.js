const $ = require('jquery');
import * as BT from "./behaviorTree";
import { mainTree } from "./Agent";

export default function renderTree(outerContainer){
    const container = document.createElement("div");
    outerContainer.appendChild(container);

    renderTreeInternal(container);

    const reorderButtonContainer = document.createElement("div");
    reorderButtonContainer.style.align = "center";
    const reorderButton = document.createElement("input");
    reorderButton.type = "button";
    reorderButton.onclick = () => {
        $(container).children().remove("svg");
        renderTreeInternal(container);
    };
    reorderButton.value = "Reorder";
    reorderButtonContainer.appendChild(reorderButton);
    outerContainer.appendChild(reorderButtonContainer);
}

function renderTreeInternal(container){
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, "svg");
    svg.setAttributeNS(null, "width", 1000);
    svg.setAttributeNS(null, "height", 600);
    svg.style.backgroundColor = "#3f3f3f";
    // Adding svg and nodes first and then adjust attributes may not be optimal in terms of DOM manipulation
    // and rendering, but we need it to compute text widths on the browser window.
    $(container).prepend(svg);
    const svgPalette = document.createElementNS(ns, "g");
    svg.appendChild(svgPalette);
    const svgInternal = document.createElementNS(ns, "g");
    svg.appendChild(svgInternal);

    const getMousePositionTemplate = elem => evt => {
        var CTM = elem.getScreenCTM();
        return [
          (evt.clientX - CTM.e) / CTM.a,
          (evt.clientY - CTM.f) / CTM.d
        ];
    }
    const getMousePosition = getMousePositionTemplate(svgInternal);

    function getNodeText(nodeInfo, nodeIndex){
        let node = nodeInfo.node;
        let nodeName = node.name;
        if(nodeName.substr(nodeName.length-4) === "Node")
            nodeName = nodeName.substr(0, nodeName.length-4);
        return `[${nodeIndex}] ${nodeName}`;
    }

    let selectedElement = null;
    let offset;
    let nodeMap = [];
    let reordering = null;

    function makeDraggable(nodeInfo) {
        nodeInfo.rectElement.setAttributeNS(null, "class", "draggable");
        nodeMap.push(nodeInfo);
    }

    (function makeDraggablePrepare(){
        svg.addEventListener('mousedown', startDrag);
        svg.addEventListener('mousemove', drag);
        svg.addEventListener('mouseup', endDrag);
        svg.addEventListener('mouseleave', endDrag);
        function startDrag(evt) {
            if (evt.target.classList.contains('draggable')) {
                selectedElement = nodeMap.find(nodeInfo => nodeInfo.rectElement === evt.target);
                if(!selectedElement)
                    return;
                offset = getMousePosition(evt);
                offset[0] -= selectedElement.position[0];
                offset[1] -= selectedElement.position[1];
            }
        }
        function drag(evt) {
            if(selectedElement){
                const nodeInfo = selectedElement;
                evt.preventDefault();
                var coord = getMousePosition(evt);
                nodeInfo.position[0] = coord[0] - offset[0];
                nodeInfo.position[1] = coord[1] - offset[1];
                nodeInfo.nodeElement.setAttribute("transform", `translate(${nodeInfo.position[0]}, ${nodeInfo.position[1]})`);
                // Try reordering among siblings
                if(nodeInfo.parentNode){
                    const currentIndex = nodeInfo.parentNode.childNodes.indexOf(nodeInfo);
                    for(let i = 0; i < currentIndex; i++){
                        if(nodeInfo.position[0] < nodeInfo.parentNode.childNodes[i].position[0]){
                            reordering = i;
                            console.log(`Reordering ${currentIndex} -> ${i}`);
                            break;
                        }
                    }
                    for(let i = currentIndex + 1; i < nodeInfo.parentNode.childNodes.length; i++){
                        if(nodeInfo.parentNode.childNodes[i].position[0] + nodeInfo.parentNode.childNodes[i].width < nodeInfo.position[0]){
                            reordering = i+1;
                            console.log(`Reordering ${currentIndex} -> ${i}`);
                            break;
                        }
                    }
                }
                if(nodeInfo.parentConnector)
                    nodeInfo.parentConnector.setAttribute("d", getParentConnectorPath(
                        nodeInfo.parentNode.position, nodeInfo.parentNode.rectElement,
                        nodeInfo.position, nodeInfo.rectElement));
                if(nodeInfo.childNodes){
                    nodeInfo.childNodes.forEach(childNode =>
                        childNode.parentConnector.setAttribute("d", getParentConnectorPath(
                            nodeInfo.position, nodeInfo.rectElement, childNode.position, childNode.rectElement)));
                }
                for(let connector of nodeInfo.inputPortConnectors){
                    connector(inputPort => {
                        inputPort.x = nodeInfo.position[0] + inputPort.deltaX;
                        inputPort.y = nodeInfo.position[1] + inputPort.deltaY;
                        return inputPort;
                    });
                }
                for(let connector of nodeInfo.outputPortConnectors){
                    connector(outputPort => {
                        outputPort.x = nodeInfo.position[0] + outputPort.deltaX;
                        outputPort.y = nodeInfo.position[1] + outputPort.deltaY;
                        return outputPort;
                    });
                }
            }
        }
        function endDrag(evt) {
            if(selectedElement){
                if(selectedElement.position[0] < paletteOffset[0]){
                    selectedElement.nodeElement.remove();
                    if(selectedElement.parentNode){
                        const nodeInfoChildren = selectedElement.parentNode.childNodes;
                        const childIndex = nodeInfoChildren.indexOf(selectedElement);
                        if(selectedElement.parentConnector)
                            selectedElement.parentConnector.remove();
                        nodeInfoChildren.splice(childIndex, 1);
                        selectedElement.parentNode.node.spliceChild(childIndex, 1);
                        reordering = null;
                        selectedElement = null;
                    }
                }
                if(reordering !== null){
                    const nodeInfo = selectedElement;
                    const currentIndex = nodeInfo.parentNode.childNodes.indexOf(nodeInfo);
                    if(reordering < currentIndex){
                        nodeInfo.parentNode.childNodes.splice(currentIndex, 1);
                        nodeInfo.parentNode.childNodes.splice(reordering, 0, nodeInfo);
                        nodeInfo.parentNode.node.spliceChild(currentIndex, 1);
                        nodeInfo.parentNode.node.spliceChild(reordering, 0, nodeInfo.node);
                        }
                    else{
                        nodeInfo.parentNode.childNodes.splice(reordering, 0, nodeInfo);
                        nodeInfo.parentNode.childNodes.splice(currentIndex, 1);
                        nodeInfo.parentNode.node.spliceChild(reordering, 0, nodeInfo.node);
                        nodeInfo.parentNode.node.spliceChild(currentIndex, 1);
                    }
                    function retext(nodeInfo, nodeIndex){
                        nodeInfo.textElement.textContent = getNodeText(nodeInfo, nodeIndex);
                        for(let i = 0; i < nodeInfo.childNodes.length; i++)
                            retext(nodeInfo.childNodes[i], i);
                    }
                    let rootNode = nodeInfo.parentNode;
                    while(rootNode.parentNode)
                        rootNode = rootNode.parentNode;
                    retext(rootNode, 0);
                    console.log(`Reordered ${currentIndex} -> ${reordering}`);
                }
                reordering = null;
                selectedElement = null;
            }
        }
    })();

    const paletteNodeMap = [];
    (function makePaletteDraggablePrepare(nodeMap){
        const getMousePosition = getMousePositionTemplate(svgPalette);
        let offset = [0, 0];
        let selectedElement = null;
        svg.addEventListener('mousedown', startDrag);
        svg.addEventListener('mousemove', drag);
        svg.addEventListener('mouseup', endDrag);
        svg.addEventListener('mouseleave', endDrag);
        function startDrag(evt) {
            if (evt.target.classList.contains('paletteDraggable')) {
                const foundElement = nodeMap.find(nodeInfo => nodeInfo.rectElement === evt.target);
                if(!foundElement)
                    return;
                selectedElement = newNodeInfo(foundElement.node, [...foundElement.position], null);
                renderNodePalette(selectedElement, 0);
                offset = getMousePosition(evt);
                offset[0] -= selectedElement.position[0];
                offset[1] -= selectedElement.position[1];
            }
        }
        function drag(evt) {
            if(selectedElement){
                const nodeInfo = selectedElement;
                evt.preventDefault();
                var coord = getMousePosition(evt);
                nodeInfo.position[0] = coord[0] - offset[0];
                nodeInfo.position[1] = coord[1] - offset[1];
                nodeInfo.nodeElement.setAttribute("transform", `translate(${nodeInfo.position[0]}, ${nodeInfo.position[1]})`);
            }
        }
        function endDrag(evt) {
            if(selectedElement){
                selectedElement.nodeElement.remove();
                selectedElement.position[0] -= svgInternal.getScreenCTM().e - svgPalette.getScreenCTM().e;
                renderNode(selectedElement, 0);
                selectedElement = null;
            }
        }
    })(paletteNodeMap);

    (function makeChildPortDraggablePrepare(){
        svg.addEventListener('mousedown', startDrag);
        svg.addEventListener('mousemove', drag);
        svg.addEventListener('mouseup', endDrag);
        svg.addEventListener('mouseleave', endDrag);
        let draggingConnector;
        let targetConnector;
        function startDrag(event){
            if(event.target.classList.contains('childConnectPort')){
                const nodeInfo = nodeMap.find(nodeInfo => nodeInfo.childConnectPort === event.target)
                const mouse = getMousePosition(event);
                const childConnector = document.createElementNS(ns, "path");
                childConnector.setAttribute("d", getParentConnectorPath(
                    nodeInfo.position, nodeInfo.rectElement,
                    mouse, null));
                childConnector.setAttribute("stroke-width", 4);
                childConnector.setAttribute("stroke", "#afafaf");
                childConnector.setAttribute("fill", "none");
                childConnector.setAttribute("class", "nondraggable");
                svgInternal.appendChild(childConnector);
                nodeInfo.childConnector = childConnector;
                draggingConnector = nodeInfo;
            }
        }
        function drag(event){
            if(draggingConnector){
                const nodeInfo = draggingConnector;
                const mouse = getMousePosition(event);
                nodeInfo.childConnector.setAttribute("d", getParentConnectorPath(
                    nodeInfo.position, nodeInfo.rectElement, mouse, null));
                // Don't connect with itself!
                if(event.target.classList.contains("parentConnectPort")
                    && event.target !== nodeInfo.parentConnectPort)
                {
                    const newTargetConnector = nodeMap.find(nodeInfo => nodeInfo.parentConnectPort === event.target);
                    if(targetConnector)
                        targetConnector.parentConnectPort.setAttribute("stroke", "#003f3f");
                    targetConnector = newTargetConnector;
                    event.target.setAttribute("stroke", "#ff7f7f");
                    function clearHighlight(event){
                        event.target.setAttribute("stroke", "#003f3f");
                        targetConnector = null;
                        event.target.removeEventListener("mouseleave", clearHighlight);
                    }
                    event.target.addEventListener("mouseleave", clearHighlight);
                }
            }
            else if(event.target.classList.contains('childConnectPort')){
                event.target.setAttribute("stroke", "#ffffff");
                function clearHighlight(event){
                    event.target.setAttribute("stroke", "#003f3f");
                    event.target.removeEventListener("mouseleave", clearHighlight);
                }
                event.target.addEventListener("mouseleave", clearHighlight);
            }
        }
        function endDrag(_event){
            if(draggingConnector){
                const nodeInfo = draggingConnector;
                nodeInfo.childConnector.remove();
                nodeInfo.childConnector = null;
                // Skip if connecting to the same parent (no-op)
                if(targetConnector && draggingConnector.node.enumerateChildren().indexOf(targetConnector) < 0 &&
                    draggingConnector.node.enumerateChildren().length + 1 <= draggingConnector.node.maximumChildren())
                {
                    if(targetConnector.parentNode){
                        targetConnector.parentNode.childNodes.splice(
                            targetConnector.parentNode.childNodes.indexOf(targetConnector), 1);
                        targetConnector.parentConnector.remove();
                        targetConnector.parentNode.node.spliceChild(
                            targetConnector.parentNode.node.enumerateChildren().indexOf(targetConnector.node), 1);
                    }
                    targetConnector.parentNode = draggingConnector;
                    const parentConnector = document.createElementNS(ns, "path");
                    parentConnector.setAttribute("d", getParentConnectorPath(
                        nodeInfo.position, nodeInfo.rectElement,
                        targetConnector.position, targetConnector.rectElement));
                    parentConnector.setAttribute("stroke-width", 4);
                    parentConnector.setAttribute("stroke", "#ff0000");
                    parentConnector.setAttribute("fill", "none");
                    parentConnector.setAttribute("class", "nondraggable");
                    targetConnector.parentConnector = parentConnector;
                    targetConnector.parentNode = nodeInfo;
                    draggingConnector.childNodes.unshift(targetConnector);
                    nodeInfo.node.spliceChild(0, 0, targetConnector.node);
                    svgInternal.appendChild(parentConnector);
                    targetConnector.parentConnectPort.setAttribute("stroke", "#003f3f");
                }
                draggingConnector = null;
                targetConnector = null;
            }
        }
    })();

    function getParentConnectorPath(parent, parentElem, child, childElem){
        const parentHalfWidth = parentElem.getAttribute("width") / 2;
        const childHalfWidth = childElem ? childElem.getAttribute("width") / 2 : 0;
        return `M${parent[0] + parentHalfWidth} ${parent[1] + 35
            }C${parent[0] + parentHalfWidth} ${parent[1] + 55
            },${child[0] + childHalfWidth} ${child[1]-15
            },${child[0] + childHalfWidth},${child[1]}`;
    }

    const inputPorts = {};
    const outputPorts = {};
    const deferred = [];

    const renderNodeTemplate = (svgInternal, inputPorts, outputPorts, deferred, makeDraggable, editable) => (nodeInfo, nodeIndex) => {
        const {node} = nodeInfo;
        const nodeElement = document.createElementNS(ns, "g");
        nodeElement.setAttributeNS(null, 'width', 100);
        nodeElement.setAttributeNS(null, 'height', 25);
        svgInternal.appendChild(nodeElement);
        nodeInfo.nodeElement = nodeElement;
        let parentConnector = null;
        if(nodeInfo.parentNode){
            deferred.push(() => {
                parentConnector = document.createElementNS(ns, "path");
                parentConnector.setAttribute("d", getParentConnectorPath(
                    nodeInfo.parentNode.position, nodeInfo.parentNode.rectElement,
                    nodeInfo.position, nodeInfo.rectElement));
                parentConnector.setAttribute("stroke-width", 4);
                parentConnector.setAttribute("stroke", "#ff0000");
                parentConnector.setAttribute("fill", "none");
                parentConnector.setAttribute("class", "nondraggable");
                nodeInfo.parentConnector = parentConnector;
                svgInternal.appendChild(parentConnector);
            });
        }
        const rect = document.createElementNS(ns, "rect");
        rect.setAttributeNS(null, 'width', 100);
        rect.setAttributeNS(null, 'height', 35 + (node.inputPort.length + node.outputPort.length) * 20);
        rect.setAttributeNS(null, 'fill', node instanceof BT.IfNode ? '#7f7f00' :
            node.isLeafNode() ? '#3f7f3f' : '#af3f4f');
        rect.setAttributeNS(null, "stroke-width", 2);
        rect.setAttributeNS(null, "stroke", "#000");
        nodeInfo.rectElement = rect;
        nodeElement.appendChild(rect);
        const text = document.createElementNS(ns, "text");
        text.setAttribute('x', '10');
        text.setAttribute('y', '20');
        text.setAttribute('font-size','18');
        text.textContent = getNodeText(nodeInfo, nodeIndex);
        text.setAttribute("class", "noselect nomouse");
        text.style.fill = "white";
        nodeElement.appendChild(text);
        nodeInfo.textElement = text;
        const bbox = text.getBBox();
        let width = Math.max(100, bbox.width + 20);

        let y = 40;
        function addPort(name, textColor, portCollection, portX, writer, reader){
            const portText = document.createElementNS(ns, "text");
            portText.setAttribute('x', 10);
            portText.setAttribute('y', y);
            portText.setAttribute('font-size','16');
            portText.setAttribute("class", "noselect");
            portText.style.fill = textColor;
            portText.textContent = name;
            const portPosition = [portX, y];
            if(editable){
                portText.addEventListener("click", (evt) => {
                    const inputField = document.createElement("input");
                    inputField.value = portText.textContent;
                    inputField.style.position = "absolute";
                    const containerBBox = container.getBoundingClientRect();
                    const bbox = portText.getBoundingClientRect();
                    inputField.style.left = `${bbox.x - containerBBox.x}px`;
                    inputField.style.top = `${bbox.y - containerBBox.y}px`;
                    inputField.onkeydown = event => {
                        if(event.keyCode === 13){ // enter
                            portText.textContent = inputField.value;
                            removePortConnector(portCollection, reader());
                            writer(inputField.value);
                            addPortConnectorCollection(portPosition, portCollection, inputField.value);
                            updateConnection();
                            cleanup();
                            event.preventDefault();
                        }
                        else if(event.keyCode === 27){ // escape
                            cleanup();
                        }
                        return true;
                    }
                    const mouseDownEvent = event => {
                        cleanup();
                    };
                    function cleanup(){
                        inputField.remove();
                        svg.removeEventListener("click", mouseDownEvent);
                    }
                    container.appendChild(inputField);
                    inputField.focus();
                    svg.addEventListener("mousedown", mouseDownEvent);
                    evt.stopPropagation();
                });
            }
            nodeElement.appendChild(portText);
            const bbox = portText.getBBox();
            width = Math.max(width, bbox.width + 20);
            y += 20;
            return portPosition;
        }

        function addPortConnector([x, y], connectorColor, portCollection, portValue){
            const portConnector = document.createElementNS(ns, "rect");
            portConnector.setAttribute('x', x - 5);
            portConnector.setAttribute('y', y - 10);
            portConnector.setAttributeNS(null, 'width', 10);
            portConnector.setAttributeNS(null, 'height', 10);
            portConnector.setAttributeNS(null, 'fill', connectorColor);
            portConnector.setAttributeNS(null, 'stroke', 'black');
            nodeElement.appendChild(portConnector);
            addPortConnectorCollection([x, y], portCollection, portValue);
        }

        function addPortConnectorCollection([x, y], portCollection, portValue){
            if(portValue){
                if(portValue[0] === "{" && portValue[portValue.length-1] === "}"){
                    const portName = portValue.substr(1, portValue.length-2);
                    if(!(portName in portCollection))
                        portCollection[portName] = [];
                    portCollection[portName].push({
                        x: nodeInfo.position[0] + x,
                        y: nodeInfo.position[1] + y - 5,
                        deltaX: x,
                        deltaY: y - 5,
                        nodeInfo,
                    });
                }
            }
        }

        function removePortConnector(portCollection, portValue){
            if(portValue){
                if(portValue[0] === "{" && portValue[portValue.length-1] === "}"){
                    const portName = portValue.substr(1, portValue.length-2);
                    if(!(portName in portCollection))
                        return;
                    const array = portCollection[portName];
                    const deleteIndex = array.findIndex(value => value.nodeInfo === nodeInfo);
                    if(array[deleteIndex].elem){
                        array[deleteIndex].elem.remove();
                    }
                    array.splice(deleteIndex, 1);
                }
            }
        }

        node.inputPort
            .map((portValue, index) => [addPort(portValue || "IN", "#afafff", inputPorts, 0,
                value => node.inputPort[index] = value, () => node.inputPort[index]), portValue])
            .forEach(([position, portValue]) => addPortConnector(position, "#7f7fff", inputPorts, portValue));
        node.outputPort
            .map((portValue, index) => [addPort(portValue || "OUT", "#ffafaf", outputPorts, width,
                value => node.outputPort[index] = value, () => node.outputPort[index]), portValue])
            .forEach(([position, portValue]) => addPortConnector(position, "#ff7f7f", outputPorts, portValue));

        const parentConnectPort = document.createElementNS(ns, "circle");
        parentConnectPort.setAttribute("cx", width / 2);
        parentConnectPort.setAttribute("cy", 0);
        parentConnectPort.setAttribute("r", 7);
        parentConnectPort.setAttribute("stroke", "#003f3f");
        parentConnectPort.setAttribute("stroke-width", 3);
        parentConnectPort.setAttribute("fill", "#00ffff");
        parentConnectPort.setAttribute("class", "parentConnectPort");
        nodeElement.appendChild(parentConnectPort);
        nodeInfo.parentConnectPort = parentConnectPort;

        if(!node.isLeafNode()){
            const childConnectPort = document.createElementNS(ns, "circle");
            childConnectPort.setAttribute("cx", width / 2);
            childConnectPort.setAttribute("cy", 35 + (node.inputPort.length + node.outputPort.length) * 20);
            childConnectPort.setAttribute("r", 7);
            childConnectPort.setAttribute("stroke", "#003f3f");
            childConnectPort.setAttribute("stroke-width", 3);
            childConnectPort.setAttribute("fill", "#00ffff");
            childConnectPort.setAttribute("class", 'childConnectPort');
            nodeElement.appendChild(childConnectPort);
            nodeInfo.childConnectPort = childConnectPort;
        }

        rect.setAttributeNS(null, "width", width);
        nodeInfo.width = width;

        nodeElement.setAttribute("transform", `translate(${nodeInfo.position[0]}, ${nodeInfo.position[1]})`);

        makeDraggable(nodeInfo);

        return [width, y];
    };

    const renderNodePalette = renderNodeTemplate(svgPalette, {}, {}, {}, nodeInfo => {
        nodeInfo.rectElement.setAttribute("class", "paletteDraggable");
        nodeInfo.rectElement.style.cursor = "move";
        paletteNodeMap.push(nodeInfo);
    }, false);

    function newNodeInfo(node, offset, parentNode){
        return {
            node,
            parentNode,
            position: offset,
            parentConnectPort: null,
            parentConnector: null,
            childNodes: [],
            inputPortConnectors: [],
            outputPortConnectors: [],
            nodeElement: null,
            rectElement: null,
            textElement: null,
            childConnectPort: null,
            childConnector: null,
            width: 0,
        }
    }

    const paletteSize = [10, 40];
    const paletteOffset = [10, 40];
    BT.allNodeTypes.forEach((nodeType, index) => {
        const nodeSize = renderNodePalette(newNodeInfo(new nodeType, [...paletteOffset], null), index);
        paletteOffset[1] += nodeSize[1] + 10;
        paletteSize[0] = Math.max(paletteSize[0], nodeSize[0]);
        paletteSize[1] = Math.max(paletteSize[1], paletteOffset[1]);
    });

    const renderNode = renderNodeTemplate(svgInternal, inputPorts, outputPorts, deferred, makeDraggable, true);

    function renderSubTree(node, offset, parentNode=null, nodeIndex=0){
        let nodeInfo = newNodeInfo(node, offset, parentNode);
        if(parentNode)
            parentNode.childNodes.push(nodeInfo);
        const children = node.enumerateChildren();
        const thisSize = renderNode(nodeInfo, nodeIndex);
        const x = offset[0];
        const parentPos = [offset[0], offset[1]];
        const X_SPACING = 20;
        const Y_SPACING = 20;
        let maxHeight = thisSize[1];
        for(let i = 0; i < children.length; i++){
            const [width, height] = renderSubTree(children[i], [parentPos[0], parentPos[1] + thisSize[1] + Y_SPACING],
                nodeInfo, i);
            parentPos[0] += width;
            maxHeight = Math.max(maxHeight, thisSize[1] + 10 + height);
        }
        return [Math.max(thisSize[0], parentPos[0] - x) + X_SPACING, maxHeight + Y_SPACING];
    }

    const size = renderSubTree(mainTree.rootNode, [20, 20]);

    const connections = [];
    function updateConnection(){
        for(let connection of connections)
            connection.remove();
        const clear = array => array.splice(0, array.length);
        clear(connections);

        // Clear existing move handlers
        for(let key in inputPorts)
            for(let inputPort of inputPorts[key])
                clear(inputPort.nodeInfo.inputPortConnectors);
        for(let key in outputPorts)
            for(let outputPort of outputPorts[key])
                clear(outputPort.nodeInfo.inputPortConnectors);

        for(let key in inputPorts){
            for(let inputPort of inputPorts[key]){
                if(key in outputPorts){
                    for(let outputPort of outputPorts[key]){
                        const portConnector = document.createElementNS(ns, "path");
                        function setPath(inputPort, outputPort){
                            portConnector.setAttribute("d", `M${inputPort.x} ${inputPort.y
                                }C${inputPort.x - 20} ${inputPort.y
                                },${outputPort.x + 20} ${outputPort.y
                                },${outputPort.x},${outputPort.y}`);
                        }
                        setPath(inputPort, outputPort);
                        portConnector.setAttribute("stroke-width", "2");
                        portConnector.setAttribute("stroke", "#7fff00");
                        portConnector.setAttribute("fill", "none");
                        portConnector.setAttribute("class", "nondraggable");
                        svgInternal.appendChild(portConnector);
                        connections.push(portConnector);
                        inputPort.nodeInfo.inputPortConnectors.push(callback =>
                            setPath(callback(inputPort), outputPort));
                        outputPort.nodeInfo.outputPortConnectors.push(callback =>
                            setPath(inputPort, callback(outputPort)));
                    }
                }
            }
        }
    }

    updateConnection();

    const scale = 0.75;
    const svgPaletteBg = document.createElementNS(ns, "rect");
    svgPaletteBg.setAttribute("width", (paletteSize[0] + 20));
    svgPaletteBg.setAttribute("height", (paletteSize[1] + 20));
    svgPaletteBg.setAttribute("fill", "#7f7f7f");
    const svgPaletteText = document.createElementNS(ns, "text");
    svgPaletteText.textContent = "Palette";
    svgPaletteText.setAttribute("font-size", 25);
    svgPaletteText.setAttribute("x", 10);
    svgPaletteText.setAttribute("y", 25);
    svgPaletteText.setAttribute("class", "noselect");
    svgPalette.appendChild(svgPaletteText);
    svgPalette.insertBefore(svgPaletteBg, svgPalette.firstChild);
    svgPalette.setAttribute("transform", `scale(${scale})`);
    // We cannot apply transform to svg element itself because Edge doesn't support it.
    svg.setAttribute("width", (paletteSize[0] + size[0] + 20) * scale);
    svg.setAttribute("height", (Math.max(paletteSize[1], size[1]) + 20) * scale);
    svgInternal.setAttribute("transform", `translate(${paletteSize[0] * scale + 20}, 0) scale(${scale})`);
    deferred.forEach(entry => entry());

}
