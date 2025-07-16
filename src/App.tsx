import React, { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "reactflow";
import ELK from "elkjs/lib/elk.bundled.js";
import "reactflow/dist/style.css";

const elk = new ELK();

const END_NODE_ID = "end-node";

// Start with root node and end node
const initialNodes: Node[] = [
  { 
    id: "root", 
    data: { label: "Root" }, 
    position: { x: 0, y: 0 }, 
    width: 500, 
    height: 300,
    style: { 
      width: 500, 
      height: 300, 
      fontSize: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  },
  { 
    id: END_NODE_ID, 
    data: { label: "End" }, 
    position: { x: 0, y: 0 }, 
    width: 500, 
    height: 300,
    style: { 
      width: 500, 
      height: 300, 
      fontSize: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffeb3b',
      border: '2px solid #f57f17'
    }
  },
];

// Connect root to end initially
const initialEdges: Edge[] = [
  { id: "root-to-end", source: "root", target: END_NODE_ID }
];

async function layoutWithElk(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  // Separate end node from other nodes
  const endNode = nodes.find(node => node.id === END_NODE_ID);
  const regularNodes = nodes.filter(node => node.id !== END_NODE_ID);
  
  // Only layout regular nodes (not the end node)
  const elkGraph = {
    id: "root",
    // mrtree layout
    layoutOptions: {
      "elk.algorithm": "mrtree", // Switch to Mr. Tree algorithm for proper tree layout
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "50", // Space between sibling nodes
      "elk.spacing.edgeNode": "20", // Space between edges and nodes
      "elk.padding": "[top=50,left=50,bottom=50,right=50]"
    },
    children: regularNodes.map((node) => ({
      id: node.id,
      width: node.width || 500,
      height: node.height || 300,
    })),
    edges: edges.filter(edge => edge.target !== END_NODE_ID).map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layout = await elk.layout(elkGraph);
  
  // Position regular nodes based on ELK layout
  const laidOutNodes = regularNodes.map((node) => {
    const layoutNode = layout.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: { x: layoutNode?.x || 0, y: layoutNode?.y || 0 },
    };
  });

  // Post-process to align sibling nodes at their top edges
  const alignedNodes = alignSiblingsAtTop(laidOutNodes, edges);
  
  // Constrain child nodes to be within reasonable vertical distance from their parent
  const constrainedNodes = constrainChildrenToParent(alignedNodes, edges);

  // Calculate bounds of all regular nodes to center the end node
  if (constrainedNodes.length > 0 && endNode) {
    const minX = Math.min(...constrainedNodes.map(node => node.position.x));
    const maxX = Math.max(...constrainedNodes.map(node => node.position.x + (node.width || 500)));
    const maxY = Math.max(...constrainedNodes.map(node => node.position.y + (node.height || 300)));
    
    // Center the end node horizontally and place it below all other nodes
    const centerX = (minX + maxX) / 2 - (endNode.width || 500) / 2;
    const endNodeY = maxY + 100; // 100px gap below the lowest node
    
    const positionedEndNode = {
      ...endNode,
      position: { x: centerX, y: endNodeY }
    };
    
    return [...constrainedNodes, positionedEndNode];
  }
  
  return constrainedNodes;
}

// Helper function to constrain child nodes to be within reasonable vertical distance from parent
function constrainChildrenToParent(nodes: Node[], edges: Edge[]): Node[] {
  const MAX_VERTICAL_GAP = 50; // Maximum allowed vertical gap between parent and child
  const constrainedNodes = [...nodes];
  
  // For each edge, check if child is too far from parent and adjust if needed
  edges.forEach(edge => {
    const parentNode = constrainedNodes.find(node => node.id === edge.source);
    const childIndex = constrainedNodes.findIndex(node => node.id === edge.target);
    
    if (parentNode && childIndex !== -1) {
      const childNode = constrainedNodes[childIndex];
      const parentBottom = parentNode.position.y + (parentNode.height || 300);
      const currentGap = childNode.position.y - parentBottom;
      
      // If child is too far from parent, move it closer
      if (currentGap > MAX_VERTICAL_GAP) {
        constrainedNodes[childIndex] = {
          ...childNode,
          position: {
            ...childNode.position,
            y: parentBottom + MAX_VERTICAL_GAP
          }
        };
      }
    }
  });
  
  return constrainedNodes;
}

// Helper function to align sibling nodes at their top edges
function alignSiblingsAtTop(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  // Build a map of parent -> children relationships
  const childrenMap = new Map<string, string[]>();
  edges.forEach(edge => {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);
  });

  const alignedNodes = [...nodes];
  
  // For each parent that has multiple children, align those children at their top edges
  childrenMap.forEach((childrenIds) => {
    if (childrenIds.length > 1) {
      // Get the actual child nodes
      const childNodes = childrenIds
        .map(childId => alignedNodes.find(node => node.id === childId))
        .filter(node => node !== undefined) as Node[];
      
      if (childNodes.length > 1) {
        // Find the topmost Y position among these sibling nodes
        const topY = Math.min(...childNodes.map(node => node.position.y));
        
        // Align all sibling nodes to this topmost Y position
        childNodes.forEach(childNode => {
          const nodeIndex = alignedNodes.findIndex(n => n.id === childNode.id);
          if (nodeIndex !== -1) {
            alignedNodes[nodeIndex] = {
              ...alignedNodes[nodeIndex],
              position: {
                ...alignedNodes[nodeIndex].position,
                y: topY
              }
            };
          }
        });
      }
    }
  });

  return alignedNodes;
}

function Flow() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [nodeCounter, setNodeCounter] = useState(1);
  const { fitView } = useReactFlow();

  const applyLayout = useCallback(() => {
    layoutWithElk(nodes, edges).then((laidOutNodes) => {
      setNodes(laidOutNodes);
      setTimeout(() => fitView({ padding: 50 }), 100);
    });
  }, [nodes, edges, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    event.stopPropagation();
    
    // Don't do anything if clicking the end node
    if (node.id === END_NODE_ID) {
      return;
    }
    
    // Build the hierarchical name based on parent's label
    const parentLabel = node.data.label as string;
    const newNodeLabel = `${parentLabel} -> Node ${nodeCounter}`;
    
    // Generate random height between 200-500px
    const randomHeight = Math.floor(Math.random() * (500 - 200 + 1)) + 200;
    
    // Create a new node
    const newNodeId = `node-${nodeCounter}`;
    const newNode: Node = {
      id: newNodeId,
      data: { label: newNodeLabel },
      position: { x: 0, y: 0 }, // Will be positioned by ELK
      width: 500,
      height: randomHeight,
      style: { 
        width: 500, 
        height: randomHeight, 
        fontSize: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    };

    // Update edges:
    // 1. Remove any existing edge from clicked node to end node
    // 2. Add edge from clicked node to new node
    // 3. Add edge from new node to end node
    setEdges((prevEdges) => {
      const filteredEdges = prevEdges.filter(edge => 
        !(edge.source === node.id && edge.target === END_NODE_ID)
      );
      
      return [
        ...filteredEdges,
        {
          id: `edge-${node.id}-${newNodeId}`,
          source: node.id,
          target: newNodeId,
        },
        {
          id: `edge-${newNodeId}-${END_NODE_ID}`,
          source: newNodeId,
          target: END_NODE_ID,
        }
      ];
    });

    // Add the new node
    setNodes((prevNodes) => [...prevNodes, newNode]);
    setNodeCounter((prev) => prev + 1);
  }, [nodeCounter]);

  // Apply layout whenever nodes or edges change
  useEffect(() => {
    if (nodes.length > 0) {
      applyLayout();
    }
  }, [nodes.length, edges.length]);

  const resetGraph = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setNodeCounter(1);
  }, []);

  return (
    <>
      <div style={{ position: "absolute", zIndex: 10, top: 10, left: 10, display: "flex", gap: "10px" }}>
        <button onClick={applyLayout}>
          Re-layout
        </button>
        <button onClick={resetGraph}>
          Reset
        </button>
      </div>
      <div style={{ 
        position: "absolute", 
        zIndex: 10, 
        top: 10, 
        right: 10, 
        background: "rgba(255,255,255,0.9)", 
        padding: "10px", 
        borderRadius: "5px",
        fontSize: "12px"
      }}>
        Click any node (except yellow end node) to add a child
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
        onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <div style={{ width: "100vw", height: "100vh" }}>
        <Flow />
      </div>
    </ReactFlowProvider>
  );
}
