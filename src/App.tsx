import React, { useEffect, useState, useCallback, useMemo } from "react";
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

// Constants for better maintainability
const DEFAULT_NODE_WIDTH = 500;
const DEFAULT_NODE_HEIGHT = 300;
const VERTICAL_SPACING = 100;
const NODE_SPACING = 50;
const MIN_RANDOM_HEIGHT = 200;
const MAX_RANDOM_HEIGHT = 500;

// Constants for consistent edge styling
const EDGE_THICKNESS = 2;
const EDGE_COLOR = '#999';
const EDGE_SPACING = 20;
const EDGE_NODE_SPACING = 30;
const LAYER_EDGE_SPACING = 40;

// FIX BEX-1665: Handle positioning constants to eliminate gaps between edges and nodes
const HANDLE_SIZE = 12; // Size of the connection handle
const HANDLE_BORDER_WIDTH = 2;

// Custom node component with collapse/expand buttons and precise edge connection
function CustomNode({ id, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  
  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeHeight(id, 100);
  };
  
  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNodeHeight(id, data.originalHeight || DEFAULT_NODE_HEIGHT);
  };
  
  const updateNodeHeight = (nodeId: string, newHeight: number) => {
    setNodes((nodes) => 
      nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            width: DEFAULT_NODE_WIDTH,
            height: newHeight,
            style: {
              ...node.style,
              width: DEFAULT_NODE_WIDTH,
              height: newHeight,
            },
            data: {
              ...node.data,
              originalHeight: node.data.originalHeight || node.height || DEFAULT_NODE_HEIGHT,
            }
          };
        }
        return node;
      })
    );
  };
  
  const isEndNode = id === END_NODE_ID;
  
  // FIX BEX-1665: Improved handle styles to eliminate gaps between edges and nodes
  const handleStyle = {
    background: '#fff',
    border: `${HANDLE_BORDER_WIDTH}px solid ${EDGE_COLOR}`,
    width: `${HANDLE_SIZE}px`,
    height: `${HANDLE_SIZE}px`,
    borderRadius: '50%',
    // Ensure handles are positioned exactly at the node boundary
    position: 'absolute' as const,
  };

  // FIX BEX-1665: Position handles precisely at the node edges to eliminate gaps
  const topHandleStyle = {
    ...handleStyle,
    top: `-${HANDLE_SIZE / 2}px`, // Position handle centered on the top edge
    left: '50%',
    transform: 'translateX(-50%)', // Center horizontally
  };

  const bottomHandleStyle = {
    ...handleStyle,
    bottom: `-${HANDLE_SIZE / 2}px`, // Position handle centered on the bottom edge
    left: '50%',
    transform: 'translateX(-50%)', // Center horizontally
  };
  
  return (
    <div style={{
      width: `${DEFAULT_NODE_WIDTH}px`,
      height: '100%',
      backgroundColor: isEndNode ? '#ffeb3b' : '#fff',
      border: isEndNode ? '2px solid #f57f17' : '1px solid #ddd',
      borderRadius: '5px',
      boxSizing: 'border-box',
      position: 'relative' // Ensure proper positioning context for handles
    }}>
      {/* FIX BEX-1665: Top handle with precise positioning to eliminate gaps */}
      <Handle 
        type="target" 
        position={Position.Top} 
        style={topHandleStyle}
        id="top"
      />
      
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
            aria-label="Collapse node"
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
            aria-label="Expand node"
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
      
      {/* FIX BEX-1665: Bottom handle with precise positioning to eliminate gaps */}
      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={bottomHandleStyle}
        id="bottom"
      />
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
    data: { label: "Root", originalHeight: DEFAULT_NODE_HEIGHT }, 
    position: { x: 0, y: 0 }, 
    width: DEFAULT_NODE_WIDTH, 
    height: DEFAULT_NODE_HEIGHT,
    style: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
  },
  { 
    id: END_NODE_ID, 
    type: "customNode",
    data: { label: "End", originalHeight: DEFAULT_NODE_HEIGHT }, 
    position: { x: 0, y: 0 }, 
    width: DEFAULT_NODE_WIDTH, 
    height: DEFAULT_NODE_HEIGHT,
    style: { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
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
      return DEFAULT_NODE_WIDTH; // Leaf node uses its own width
    }
    
    // Calculate total width needed for all children side by side
    const childWidths = children.map(childId => calculateNodeSubtreeWidth(childId));
    const totalChildWidth = childWidths.reduce((sum, width) => sum + width, 0);
    const spacingBetweenChildren = (children.length - 1) * VERTICAL_SPACING; // spacing between siblings
    const minSubtreeWidth = totalChildWidth + spacingBetweenChildren;
    
    // Node should be at least as wide as its subtree needs
    return Math.max(DEFAULT_NODE_WIDTH, minSubtreeWidth);
  };
  
  // Return nodes with calculated ELK widths
  return nodes.map(node => ({
    ...node,
    elkWidth: calculateNodeSubtreeWidth(node.id)
  }));
}

/**
 * Enhanced centering logic specifically for skewed/asymmetric graphs.
 * This function centers root nodes over their entire subtree, regardless of asymmetry.
 * @param nodes - Array of graph nodes
 * @param edges - Array of edges connecting the nodes
 * @returns Adjusted array of nodes with updated positions
 */
function centerInputNodeForSkewedGraph(nodes: Node[], edges: Edge[]): Node[] {
  const adjustedNodes = [...nodes];
  
  // Find the root node (node with no incoming edges, excluding END_NODE_ID)
  const hasIncomingEdge = new Set(edges.map(e => e.target));
  const rootNodes = nodes.filter(node => !hasIncomingEdge.has(node.id) && node.id !== END_NODE_ID);
  
  if (rootNodes.length === 0) return adjustedNodes;
  
  // For each root node, calculate the overall bounds of its entire subtree
  rootNodes.forEach(rootNode => {
    const rootIndex = adjustedNodes.findIndex(n => n.id === rootNode.id);
    if (rootIndex === -1) return;
    
    // Get all descendants of this root node using iterative approach to prevent stack overflow
    const getDescendants = (nodeId: string): Node[] => {
      const result: Node[] = [];
      const visited = new Set<string>();
      const stack = [nodeId];
      
      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        const childEdges = edges.filter(e => e.source === currentId);
        const children = childEdges
          .map(e => adjustedNodes.find(n => n.id === e.target))
          .filter(Boolean) as Node[];
        
        result.push(...children);
        stack.push(...children.map(c => c.id));
      }
      
      return result;
    };
    
    const descendants = getDescendants(rootNode.id);
    if (descendants.length === 0) return;
    
    // Calculate the overall bounds of all descendants
    const leftmostX = Math.min(...descendants.map(n => n.position.x));
    const rightmostX = Math.max(...descendants.map(n => n.position.x + (n.width || DEFAULT_NODE_WIDTH)));
    const subtreeCenterX = (leftmostX + rightmostX) / 2;
    
    // Center the root node over the entire subtree
    const rootWidth = rootNode.width || DEFAULT_NODE_WIDTH;
    const newRootX = subtreeCenterX - (rootWidth / 2);
    
    // Update the root node position
    adjustedNodes[rootIndex] = {
      ...adjustedNodes[rootIndex],
      position: {
        ...adjustedNodes[rootIndex].position,
        x: newRootX
      }
    };
  });
  
  return adjustedNodes;
}

/**
 * FIX BEX-1665: Apply consistent edge styling with improved connection points to eliminate gaps
 * @param edges - Array of edges to style
 * @returns Styled edge array with consistent properties and precise node connections
 */
function applyConsistentEdgeStyles(edges: Edge[]): Edge[] {
  return edges.map(edge => ({
    ...edge,
    style: {
      strokeWidth: EDGE_THICKNESS,
      stroke: EDGE_COLOR,
    },
    type: 'smoothstep', // Use smoothstep for consistent curved edges
    animated: false,
    markerEnd: {
      type: 'arrowclosed',
      width: 20,
      height: 20,
      color: EDGE_COLOR,
    },
    // FIX BEX-1665: Ensure edges connect to specific handles to eliminate gaps
    sourceHandle: 'bottom',
    targetHandle: 'top',
  }));
}

/**
 * Enhanced layout function with improved centering for skewed graphs and consistent edge styling
 */
async function layoutWithElk(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  try {
    // Apply consistent edge styles first
    const styledEdges = applyConsistentEdgeStyles(edges);
    
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
        "elk.spacing.nodeNode": NODE_SPACING.toString(),
        "elk.spacing.edgeNode": EDGE_NODE_SPACING.toString(), 
        "elk.mrtree.compaction": "true",
        "elk.mrtree.edgeRoutingMode": "AVOID_OVERLAP",
        "elk.mrtree.searchOrder": "DFS", // Depth-first search for better centering
        "elk.mrtree.weighting": "MODEL_ORDER", // Respect model order for positioning
        "elk.padding": "[top=50,left=50,bottom=50,right=50]",
        // Enhanced edge consistency settings
        "elk.spacing.edgeEdge": EDGE_SPACING.toString(), // Consistent spacing between edges
        "elk.layered.spacing.edgeNodeBetweenLayers": LAYER_EDGE_SPACING.toString(), // Consistent vertical edge spacing
        "elk.layered.spacing.edgeEdgeBetweenLayers": EDGE_SPACING.toString(), // Consistent edge-to-edge spacing
        // FIX BEX-1665: Additional settings to ensure proper edge-to-node connections
        "elk.edgeRouting": "ORTHOGONAL", // Use orthogonal routing for cleaner connections
        "elk.layered.considerModelOrder.strategy": "PREFER_NODES", // Prioritize node positioning over edge routing
      },
      children: mainNodesWithSubtreeWidths.map((node: Node & { elkWidth: number }) => ({
        id: node.id,
        width: node.elkWidth,
        height: node.height || DEFAULT_NODE_HEIGHT,
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
        width: DEFAULT_NODE_WIDTH,
      };
    });

    // Apply enhanced post-processing to main tree
    const alignedMainNodes = alignSiblingsAtTop(mainLaidOutNodes, mainTreeEdges);
    const centeredMainNodes = centerParentsOverChildren(alignedMainNodes, mainTreeEdges);
    
    // ENHANCED: Apply additional centering for skewed graphs
    const skewCorrectedNodes = centerInputNodeForSkewedGraph(centeredMainNodes, mainTreeEdges);
    
    const finalMainNodes = constrainChildrenToParent(skewCorrectedNodes, mainTreeEdges);

    // Position output node below main tree
    const mainTreeBounds = finalMainNodes.length > 0 ? {
      minX: Math.min(...finalMainNodes.map(node => node.position.x)),
      maxX: Math.max(...finalMainNodes.map(node => node.position.x + (node.width || DEFAULT_NODE_WIDTH))),
      maxY: Math.max(...finalMainNodes.map(node => node.position.y + (node.height || DEFAULT_NODE_HEIGHT)))
    } : { minX: 0, maxX: DEFAULT_NODE_WIDTH, maxY: 0 };
    
    const centerX = (mainTreeBounds.minX + mainTreeBounds.maxX) / 2 - ((endNode?.width || DEFAULT_NODE_WIDTH) / 2);
    const endNodeY = mainTreeBounds.maxY + VERTICAL_SPACING;
    
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
          "elk.spacing.nodeNode": NODE_SPACING.toString(),
          "elk.spacing.edgeNode": EDGE_NODE_SPACING.toString(), 
          "elk.mrtree.compaction": "true",
          "elk.mrtree.edgeRoutingMode": "AVOID_OVERLAP",
          "elk.mrtree.searchOrder": "DFS",
          "elk.mrtree.weighting": "MODEL_ORDER",
          "elk.padding": "[top=50,left=50,bottom=50,right=50]",
          // Apply consistent edge settings to output tree as well
          "elk.spacing.edgeEdge": EDGE_SPACING.toString(),
          "elk.layered.spacing.edgeNodeBetweenLayers": LAYER_EDGE_SPACING.toString(),
          "elk.layered.spacing.edgeEdgeBetweenLayers": EDGE_SPACING.toString(),
          // FIX BEX-1665: Same edge routing improvements for output tree
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
        },
        children: outputNodesWithWidths.map((node: Node & { elkWidth: number }) => ({
          id: node.id,
          width: node.elkWidth,
          height: node.height || DEFAULT_NODE_HEIGHT,
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
          width: DEFAULT_NODE_WIDTH,
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
      
      // Apply enhanced centering to output tree as well
      const skewCorrectedOutputNodes = centerInputNodeForSkewedGraph(centeredOutputNodes, [
        ...edges.filter(edge => edge.source === END_NODE_ID),
        ...outputTreeEdges
      ]);
      
      finalOutputNodes = constrainChildrenToParent(skewCorrectedOutputNodes, [
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
  } catch (error) {
    console.error('Layout calculation failed:', error);
    return nodes; // Return original nodes as fallback
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
    const childrenRightmost = Math.max(...childNodes.map(child => child.position.x + (child.width || DEFAULT_NODE_WIDTH)));
    const childrenCenter = (childrenLeftmost + childrenRightmost) / 2;
    
    // Find the parent node and center it over children (but don't move children)
    const parentIndex = adjustedNodes.findIndex(node => node.id === parentId);
    if (parentIndex !== -1) {
      const parent = adjustedNodes[parentIndex];
      const parentWidth = parent.width || DEFAULT_NODE_WIDTH;
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

// Helper function to constrain child nodes to be within reasonable vertical distance from parent
function constrainChildrenToParent(nodes: Node[], edges: Edge[]): Node[] {
  const MAX_VERTICAL_GAP = NODE_SPACING; // Maximum allowed vertical gap between parent and child
  const constrainedNodes = [...nodes];
  
  // For each edge, check if child is too far from parent and adjust if needed
  edges.forEach(edge => {
    const parentNode = constrainedNodes.find(node => node.id === edge.source);
    const childIndex = constrainedNodes.findIndex(node => node.id === edge.target);
    
    if (parentNode && childIndex !== -1) {
      const childNode = constrainedNodes[childIndex];
      const parentBottom = parentNode.position.y + (parentNode.height || DEFAULT_NODE_HEIGHT);
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
    
    // Generate random height between MIN_RANDOM_HEIGHT-MAX_RANDOM_HEIGHT px
    const randomHeight = Math.floor(Math.random() * (MAX_RANDOM_HEIGHT - MIN_RANDOM_HEIGHT + 1)) + MIN_RANDOM_HEIGHT;
    
    // Create a new node
    const newNodeId = `node-${nodeCounter}`;
    const newNode: Node = {
      id: newNodeId,
      type: "customNode",
      data: { label: newNodeLabel, originalHeight: randomHeight },
      position: { x: 0, y: 0 }, // Will be positioned by ELK
      width: DEFAULT_NODE_WIDTH,
      height: randomHeight,
      style: { width: DEFAULT_NODE_WIDTH, height: randomHeight }
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
  }, [nodeCounter, edges]);

  // Use useMemo for nodeHeights to optimize performance
  const nodeHeights = useMemo(() => 
    nodes.map(n => n.height), [nodes]
  );

  // Apply layout whenever nodes or edges change (including height changes)
  useEffect(() => {
    if (nodes.length > 0) {
      applyLayout();
    }
  }, [nodes.length, edges.length, nodeHeights, applyLayout]);

  const resetGraph = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setNodeCounter(1);
  }, []);

  return (
    <>
      <div style={{ position: "absolute", zIndex: 10, top: 10, left: 10, display: "flex", gap: "10px" }}>
        <button onClick={applyLayout} aria-label="Re-layout graph">
          Re-layout
        </button>
        <button onClick={resetGraph} aria-label="Reset graph to initial state">
          Reset
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={applyConsistentEdgeStyles(edges)}
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