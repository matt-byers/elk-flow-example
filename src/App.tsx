import React, { useEffect, useState, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeProps,
} from "reactflow";
import ELK from "elkjs/lib/elk.bundled.js";
import "reactflow/dist/style.css";

const elk = new ELK();

const END_NODE_ID = "end-node";

// Custom node component with collapse/expand buttons
function CustomNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  
  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeHeight(id, 100);
  };
  
  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeHeight(id, data.originalHeight || 500);
  };
  
  const updateNodeHeight = (nodeId: string, newHeight: number) => {
    setNodes((nodes) => 
      nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            width: 500,
            height: newHeight,
            style: {
              ...node.style,
              width: 500,
              height: newHeight,
            },
            data: {
              ...node.data,
              originalHeight: node.data.originalHeight || node.height || 500,
            }
          };
        }
        return node;
      })
    );
  };
  
  const isEndNode = id === END_NODE_ID;
  
  return (
    <div style={{
      width: '500px',
      height: '100%',
      backgroundColor: isEndNode ? '#ffeb3b' : '#fff',
      border: isEndNode ? '2px solid #f57f17' : '1px solid #ddd',
      borderRadius: '5px',
      boxSizing: 'border-box'
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        padding: '10px',
        position: 'relative'
      }}>
        <div style={{ 
          position: 'absolute', 
          top: '5px', 
          right: '5px', 
          display: 'flex', 
          gap: '5px',
          zIndex: 10
        }}>
          <button 
            onClick={handleCollapse}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Collapse
          </button>
          <button 
            onClick={handleExpand}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Expand
          </button>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100%',
          fontSize: '16px'
        }}>
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = {
  customNode: CustomNode,
};

// Start with root node and end node
const initialNodes: Node[] = [
  { 
    id: "root", 
    type: "customNode",
    data: { label: "Root", originalHeight: 500 }, 
    position: { x: 0, y: 0 }, 
    width: 500, 
    height: 500,
    style: { width: 500, height: 500 }
  },
  { 
    id: END_NODE_ID, 
    type: "customNode",
    data: { label: "End", originalHeight: 500 }, 
    position: { x: 0, y: 0 }, 
    width: 500, 
    height: 500,
    style: { width: 500, height: 500 }
  },
];

// Connect root to end initially
const initialEdges: Edge[] = [
  { id: "root-to-end", source: "root", target: END_NODE_ID }
];

// Calculate subtree widths for ELK positioning
function calculateSubtreeWidths(nodes: Node[], edges: Edge[]): (Node & { elkWidth: number })[] {
  // Build parent -> children map
  const childrenMap = new Map<string, string[]>();
  edges.forEach(edge => {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);
  });
  
  // Calculate minimum width needed for each node's subtree
  const calculateNodeSubtreeWidth = (nodeId: string): number => {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      return 500; // Leaf node uses its own width
    }
    
    // Calculate total width needed for all children side by side
    const childWidths = children.map(childId => calculateNodeSubtreeWidth(childId));
    const totalChildWidth = childWidths.reduce((sum, width) => sum + width, 0);
    const spacingBetweenChildren = (children.length - 1) * 100; // 100px spacing between siblings
    const minSubtreeWidth = totalChildWidth + spacingBetweenChildren;
    
    // Node should be at least as wide as its subtree needs
    return Math.max(500, minSubtreeWidth);
  };
  
  // Return nodes with calculated ELK widths
  return nodes.map(node => ({
    ...node,
    elkWidth: calculateNodeSubtreeWidth(node.id)
  }));
}

async function layoutWithElk(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  // Separate main tree nodes from output tree nodes
  const endNode = nodes.find(node => node.id === END_NODE_ID);
  const outputTreeNodeIds = getOutputTreeDescendants(edges);
  const outputTreeNodes = nodes.filter(node => outputTreeNodeIds.includes(node.id));
  const mainTreeNodes = nodes.filter(node => 
    node.id !== END_NODE_ID && !outputTreeNodeIds.includes(node.id)
  );

  // Layout main tree (excluding connections to output node)
  const mainTreeEdges = edges.filter(edge => 
    edge.target !== END_NODE_ID && 
    !outputTreeNodeIds.includes(edge.source) && 
    !outputTreeNodeIds.includes(edge.target)
  );
  
  const mainNodesWithSubtreeWidths = calculateSubtreeWidths(mainTreeNodes, mainTreeEdges);
  
  const mainElkGraph = {
    id: "main-root",
    layoutOptions: {
      "elk.algorithm": "mrtree",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "50",
      "elk.spacing.edgeNode": "30", 
      "elk.mrtree.compaction": "true",
      "elk.mrtree.edgeRoutingMode": "AVOID_OVERLAP",
      "elk.padding": "[top=50,left=50,bottom=50,right=50]"
    },
    children: mainNodesWithSubtreeWidths.map((node: Node & { elkWidth: number }) => ({
      id: node.id,
      width: node.elkWidth,
      height: node.height || 300,
    })),
    edges: mainTreeEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const mainLayout = await elk.layout(mainElkGraph);
  
  // Position main tree nodes
  const mainLaidOutNodes = mainTreeNodes.map((node) => {
    const layoutNode = mainLayout.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: { x: layoutNode?.x || 0, y: layoutNode?.y || 0 },
      width: 500,
    };
  });

  // Apply post-processing to main tree
  const alignedMainNodes = alignSiblingsAtTop(mainLaidOutNodes, mainTreeEdges);
  const centeredMainNodes = centerParentsOverChildren(alignedMainNodes, mainTreeEdges);
  const finalMainNodes = constrainChildrenToParent(centeredMainNodes, mainTreeEdges);

  // Position output node below main tree
  const mainTreeBounds = finalMainNodes.length > 0 ? {
    minX: Math.min(...finalMainNodes.map(node => node.position.x)),
    maxX: Math.max(...finalMainNodes.map(node => node.position.x + (node.width || 500))),
    maxY: Math.max(...finalMainNodes.map(node => node.position.y + (node.height || 300)))
  } : { minX: 0, maxX: 500, maxY: 0 };
  
  const centerX = (mainTreeBounds.minX + mainTreeBounds.maxX) / 2 - ((endNode?.width || 500) / 2);
  const endNodeY = mainTreeBounds.maxY + 100;
  
  const positionedEndNode = endNode ? {
    ...endNode,
    position: { x: centerX, y: endNodeY }
  } : null;

  // Layout output tree if it exists
  let finalOutputNodes: Node[] = [];
  if (outputTreeNodes.length > 0 && positionedEndNode) {
    const outputTreeEdges = edges.filter(edge => 
      outputTreeNodeIds.includes(edge.source) && outputTreeNodeIds.includes(edge.target)
    );
    
    const outputTreeWithEnd = [positionedEndNode, ...outputTreeNodes];
    const outputNodesWithWidths = calculateSubtreeWidths(outputTreeWithEnd, [
      ...edges.filter(edge => edge.source === END_NODE_ID),
      ...outputTreeEdges
    ]);
    
    const outputElkGraph = {
      id: "output-root",
      layoutOptions: {
        "elk.algorithm": "mrtree",
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "50",
        "elk.spacing.edgeNode": "30", 
        "elk.mrtree.compaction": "true",
        "elk.mrtree.edgeRoutingMode": "AVOID_OVERLAP",
        "elk.padding": "[top=50,left=50,bottom=50,right=50]"
      },
      children: outputNodesWithWidths.map((node: Node & { elkWidth: number }) => ({
        id: node.id,
        width: node.elkWidth,
        height: node.height || 300,
      })),
      edges: [
        ...edges.filter(edge => edge.source === END_NODE_ID),
        ...outputTreeEdges
      ].map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    const outputLayout = await elk.layout(outputElkGraph);
    
    // Position output tree relative to where we want the end node
    const elkEndPosition = outputLayout.children?.find(n => n.id === END_NODE_ID);
    const offsetX = positionedEndNode.position.x - (elkEndPosition?.x || 0);
    const offsetY = positionedEndNode.position.y - (elkEndPosition?.y || 0);
    
    const outputLaidOutNodes = outputTreeWithEnd.map((node) => {
      const layoutNode = outputLayout.children?.find((n) => n.id === node.id);
      return {
        ...node,
        position: { 
          x: (layoutNode?.x || 0) + offsetX, 
          y: (layoutNode?.y || 0) + offsetY 
        },
        width: 500,
      };
    });

    // Apply post-processing to output tree
    const alignedOutputNodes = alignSiblingsAtTop(outputLaidOutNodes, [
      ...edges.filter(edge => edge.source === END_NODE_ID),
      ...outputTreeEdges
    ]);
    const centeredOutputNodes = centerParentsOverChildren(alignedOutputNodes, [
      ...edges.filter(edge => edge.source === END_NODE_ID),
      ...outputTreeEdges
    ]);
    finalOutputNodes = constrainChildrenToParent(centeredOutputNodes, [
      ...edges.filter(edge => edge.source === END_NODE_ID),
      ...outputTreeEdges
    ]);
  }

  if (finalOutputNodes.length > 0) {
    return [...finalMainNodes, ...finalOutputNodes];
  } else if (positionedEndNode) {
    return [...finalMainNodes, positionedEndNode];
  } else {
    return finalMainNodes;
  }
}

// Helper function to center parent nodes over their children (preserves ELK spacing)
function centerParentsOverChildren(nodes: Node[], edges: Edge[]): Node[] {
  const adjustedNodes = [...nodes];
  
  // Build parent -> children map
  const childrenMap = new Map<string, string[]>();
  edges.forEach(edge => {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, []);
    }
    childrenMap.get(edge.source)!.push(edge.target);
  });
  
  // Function to get tree depth for ordering
  const getTreeDepth = (nodeId: string): number => {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map(child => getTreeDepth(child)));
  };
  
  // Get all nodes with children, sorted by depth (deepest first)
  const parentsWithChildren = Array.from(childrenMap.entries())
    .filter(([, children]) => children.length > 0)
    .map(([parentId]) => ({ 
      id: parentId, 
      depth: getTreeDepth(parentId) 
    }))
    .sort((a, b) => a.depth - b.depth); // Process deepest parents first
  
  // Center each parent over its children, but DON'T move the children
  // This preserves ELK's spacing between branches while centering parents visually
  parentsWithChildren.forEach(({ id: parentId }) => {
    const children = childrenMap.get(parentId) || [];
    if (children.length === 0) return;
    
    // Get current positions of all children
    const childNodes = children
      .map(childId => adjustedNodes.find(node => node.id === childId))
      .filter(node => node !== undefined) as Node[];
    
    if (childNodes.length === 0) return;
    
    // Calculate the center point of all children
    const childrenLeftmost = Math.min(...childNodes.map(child => child.position.x));
    const childrenRightmost = Math.max(...childNodes.map(child => child.position.x + (child.width || 500)));
    const childrenCenter = (childrenLeftmost + childrenRightmost) / 2;
    
    // Find the parent node and center it over children (but don't move children)
    const parentIndex = adjustedNodes.findIndex(node => node.id === parentId);
    if (parentIndex !== -1) {
      const parent = adjustedNodes[parentIndex];
      const parentWidth = parent.width || 500;
      const newParentX = childrenCenter - (parentWidth / 2);
      
      // Only move the parent, not its children - this preserves ELK's spacing
      adjustedNodes[parentIndex] = {
        ...parent,
        position: {
          ...parent.position,
          x: newParentX
        }
      };
    }
  });
  
  return adjustedNodes;
}

// Helper function to fix actual node overlaps with minimal adjustments
// Currently disabled to test ELK's built-in AVOID_OVERLAP feature
/* function fixActualOverlaps(nodes: Node[]): Node[] {
  const adjustedNodes = [...nodes];
  const NODE_GAP = 20; // Minimal gap between nodes
  
  // Simple overlap detection - check all pairs of nodes
  for (let i = 0; i < adjustedNodes.length; i++) {
    for (let j = i + 1; j < adjustedNodes.length; j++) {
      const nodeA = adjustedNodes[i];
      const nodeB = adjustedNodes[j];
      
      // Check if nodes overlap horizontally and are at similar Y levels
      const aLeft = nodeA.position.x;
      const aRight = nodeA.position.x + (nodeA.width || 500);
      const bLeft = nodeB.position.x;
      const bRight = nodeB.position.x + (nodeB.width || 500);
      
      const aTop = nodeA.position.y;
      const aBottom = nodeA.position.y + (nodeA.height || 300);
      const bTop = nodeB.position.y;
      const bBottom = nodeB.position.y + (nodeB.height || 300);
      
      // Check for overlap (both horizontal and vertical)
      const horizontalOverlap = aLeft < bRight + NODE_GAP && bLeft < aRight + NODE_GAP;
      const verticalOverlap = aTop < bBottom && bTop < aBottom;
      
      if (horizontalOverlap && verticalOverlap) {
        // Push the rightmost node further right
        if (nodeB.position.x > nodeA.position.x) {
          const shiftAmount = aRight + NODE_GAP - bLeft;
          adjustedNodes[j] = {
            ...nodeB,
            position: {
              ...nodeB.position,
              x: nodeB.position.x + shiftAmount
            }
          };
        } else {
          const shiftAmount = bRight + NODE_GAP - aLeft;
          adjustedNodes[i] = {
            ...nodeA,
            position: {
              ...nodeA.position,
              x: nodeA.position.x + shiftAmount
            }
          };
        }
      }
    }
  }
  
  return adjustedNodes;
} */

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

// Helper function to check if a node is a descendant of the output node
function isDescendantOfOutput(nodeId: string, edges: Edge[]): boolean {
  // Find all ancestors of the given node by traversing upward
  const getAncestors = (id: string): string[] => {
    const parentEdge = edges.find(edge => edge.target === id);
    if (!parentEdge) return [];
    return [parentEdge.source, ...getAncestors(parentEdge.source)];
  };
  
  const ancestors = getAncestors(nodeId);
  return ancestors.includes(END_NODE_ID);
}

// Helper function to get all descendants of the output node
function getOutputTreeDescendants(edges: Edge[]): string[] {
  const getDescendants = (nodeId: string): string[] => {
    const children = edges.filter(edge => edge.source === nodeId).map(edge => edge.target);
    const allDescendants = [...children];
    children.forEach(childId => {
      allDescendants.push(...getDescendants(childId));
    });
    return allDescendants;
  };
  
  return getDescendants(END_NODE_ID);
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
    
    // Build the hierarchical name based on parent's label
    const parentLabel = node.data.label as string;
    const newNodeLabel = `${parentLabel} -> Node ${nodeCounter}`;
    
    // Generate random height between 200-500px
    const randomHeight = Math.floor(Math.random() * (500 - 200 + 1)) + 200;
    
    // Create a new node
    const newNodeId = `node-${nodeCounter}`;
    const newNode: Node = {
      id: newNodeId,
      type: "customNode",
      data: { label: newNodeLabel, originalHeight: randomHeight },
      position: { x: 0, y: 0 }, // Will be positioned by ELK
      width: 500,
      height: randomHeight,
      style: { width: 500, height: randomHeight }
    };

    // Update edges based on which node was clicked
    if (node.id === END_NODE_ID) {
      // If clicking the output node, just add a child to it (no connection back to output)
      setEdges((prevEdges) => [
        ...prevEdges,
        {
          id: `edge-${node.id}-${newNodeId}`,
          source: node.id,
          target: newNodeId,
        }
      ]);
    } else {
      // Check if the clicked node is a descendant of the output node
      const isOutputTreeNode = isDescendantOfOutput(node.id, edges);
      
      if (isOutputTreeNode) {
        // For output tree nodes: just add child, no connection back to output
        setEdges((prevEdges) => [
          ...prevEdges,
          {
            id: `edge-${node.id}-${newNodeId}`,
            source: node.id,
            target: newNodeId,
          }
        ]);
      } else {
        // Original behavior for main tree nodes:
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
      }
    }

    // Add the new node
    setNodes((prevNodes) => [...prevNodes, newNode]);
    setNodeCounter((prev) => prev + 1);
  }, [nodeCounter]);

  // Apply layout whenever nodes or edges change (including height changes)
  useEffect(() => {
    if (nodes.length > 0) {
      applyLayout();
    }
  }, [nodes.length, edges.length, nodes.map(n => n.height).join(',')]);

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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
