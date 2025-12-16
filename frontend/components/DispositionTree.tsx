'use client';

import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  addEdge,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Share2, Copy, CheckCircle2, X, Save, Download, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface DispositionNode {
  id: string;
  name: string;
  count: number;
  parent?: string;
  level: number;
  type?: 'success' | 'failure' | 'neutral' | 'warning' | 'info';
}

interface DispositionTreeProps {
  data?: DispositionNode[];
  readOnly?: boolean; // If true, hide all controls and make canvas read-only
  shareId?: string; // Optional share ID for loading shared structure
}

// Count mapping by dpath (from user-provided data) - dpath ensures unique nodes
const DISPOSITION_COUNTS_BY_DPATH: Record<string, number> = {
  'A': 156, // CALL_CONNECTED
  'AA': 24, // NOT_RPC
  'AAA': 10, // WRONG_PARTY_CONTACT
  'AAB': 7, // THIRD_PARTY_CONTACT
  'AAC': 3, // NO_RESPONSE_OR_SILENCE
  'AAD': 2, // CALL_DROPPED_OR_NETWORK_ISSUE
  'AB': 76, // RPC
  'ABA': 2, // BUSY_OR_CALLBACK_REQUESTED
  'ABB': 7, // CALL_DROPPED_AFTER_RPC
  'ABC': 3, // SILENT_AFTER_RPC
  'ABD': 7, // LOAN_INFORMATION_INCORRECT
  'ABDA': 6, // LOAN_DISPUTE_NOT_MY_LOAN
  'ABDB': 0, // DETAILS_MISMATCH
  'ABDC': 0, // VERIFICATION_REQUIRED
  'ABE': 47, // LOAN_INFO_CONFIRMED
  'ABEA': 8, // PAYMENT_OUTCOME
  'ABEAA': 2, // ALREADY_PAID
  'ABEAB': 3, // WILL_PAY_FULL
  'ABEABA': 0, // TODAY (under WILL_PAY_FULL)
  'ABEABB': 3, // WILL_PAY_LATER (under WILL_PAY_FULL)
  'ABEABBA': 2, // DATE_GIVEN_PTP
  'ABEABBB': 0, // NO_DATE_SOFT_PROMISE
  'ABEAC': 1, // WILL_PAY_TOKEN
  'ABEACA': 0, // TODAY (under WILL_PAY_TOKEN)
  'ABEACB': 0, // WILL_PAY_LATER (under WILL_PAY_TOKEN)
  'ABEACBA': 0, // DATE_GIVEN_PTP
  'ABEACBB': 0, // NO_DATE_SOFT_PROMISE
  'ABEAD': 0, // CANNOT_PAY
  'ABEADA': 0, // TEMPORARY_FINANCIAL_STRESS
  'ABEADAA': 0, // JOB_LOSS
  'ABEADAB': 0, // SALARY_DELAY
  'ABEADAC': 0, // CROP_FAILURE
  'ABEADAD': 0, // FESTIVAL_OR_SEASONAL_PRESSURE
  'ABEADB': 0, // MEDICAL_EMERGENCY
  'ABEADC': 0, // PERMANENT_INABILITY
  'ABEADD': 0, // FLAT_REFUSAL_OR_UNWILLING
  'ABEB': 31, // CALLBACK_OR_DEFERRAL
  'ABEC': 2, // ESCALATION_OR_OVERRIDE
  'ABECA': 0, // ESCALATED_TO_HUMAN_AGENT
  'AC': 44, // RPC_NOT_ESTABLISHED
  'ACA': 37, // CALL_DROPPED_EARLY
  'ACB': 1, // SILENT_AFTER_CALL_CONNECTED
};

// Fallback count mapping by code (for backward compatibility)
const DISPOSITION_COUNTS: Record<string, number> = {
  'CALL_CONNECTED': 156,
  'NOT_RPC': 24,
  'WRONG_PARTY_CONTACT': 10,
  'THIRD_PARTY_CONTACT': 7,
  'NO_RESPONSE_OR_SILENCE': 3,
  'CALL_DROPPED_OR_NETWORK_ISSUE': 2,
  'RPC': 76,
  'BUSY_OR_CALLBACK_REQUESTED': 2,
  'CALL_DROPPED_AFTER_RPC': 7,
  'SILENT_AFTER_RPC': 3,
  'LOAN_INFORMATION_INCORRECT': 7,
  'LOAN_DISPUTE_NOT_MY_LOAN': 6,
  'DETAILS_MISMATCH': 0,
  'VERIFICATION_REQUIRED': 0,
  'LOAN_INFO_CONFIRMED': 47,
  'PAYMENT_OUTCOME': 8,
  'ALREADY_PAID': 2,
  'WILL_PAY_FULL': 3,
  'TODAY': 0,
  'WILL_PAY_LATER': 3,
  'DATE_GIVEN_PTP': 2,
  'NO_DATE_SOFT_PROMISE': 0,
  'WILL_PAY_TOKEN': 1,
  'CANNOT_PAY': 0,
  'TEMPORARY_FINANCIAL_STRESS': 0,
  'JOB_LOSS': 0,
  'SALARY_DELAY': 0,
  'CROP_FAILURE': 0,
  'FESTIVAL_OR_SEASONAL_PRESSURE': 0,
  'MEDICAL_EMERGENCY': 0,
  'PERMANENT_INABILITY': 0,
  'FLAT_REFUSAL_OR_UNWILLING': 0,
  'CALLBACK_OR_DEFERRAL': 31,
  'ESCALATION_OR_OVERRIDE': 2,
  'ESCALATED_TO_HUMAN_AGENT': 0,
  'RPC_NOT_ESTABLISHED': 44,
  'CALL_DROPPED_EARLY': 37,
  'SILENT_AFTER_CALL_CONNECTED': 1,
};

// Custom Node Component with circle sizing based on count
const CustomNode = ({ data }: { data: any }) => {
  const { label, count, type = 'neutral' } = data;
  const [isHovered, setIsHovered] = useState(false);
  
  // Calculate circle radius based on count
  // Find max count for scaling (check both mappings)
  const allCounts = [...Object.values(DISPOSITION_COUNTS_BY_DPATH), ...Object.values(DISPOSITION_COUNTS), count];
  const maxCount = Math.max(...allCounts);
  const minRadius = 30; // Minimum radius
  const maxRadius = 100; // Maximum radius
  
  // Use square root scale for better visual distribution
  const normalizedCount = Math.sqrt(count / maxCount);
  const radius = Math.max(
    minRadius,
    Math.min(maxRadius, minRadius + (normalizedCount * (maxRadius - minRadius)))
  );
  const size = radius * 2; // Diameter
  
  // Calculate available space for text (accounting for padding and border)
  const borderWidth = 4;
  const padding = 8; // Padding inside circle
  const availableDiameter = size - (borderWidth * 2) - (padding * 2);
  const availableRadius = availableDiameter / 2;

  // Color scheme based on type
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    success: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-800 dark:text-green-200',
      border: 'border-green-500 dark:border-green-400',
    },
    failure: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-800 dark:text-red-200',
      border: 'border-red-500 dark:border-red-400',
    },
    warning: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-800 dark:text-yellow-200',
      border: 'border-yellow-500 dark:border-yellow-400',
    },
    info: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-800 dark:text-blue-200',
      border: 'border-blue-500 dark:border-blue-400',
    },
    neutral: {
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-800 dark:text-gray-200',
      border: 'border-gray-500 dark:border-gray-400',
    },
  };

  const colors = colorMap[type] || colorMap.neutral;

  // Calculate text sizes based on count comparatively, ensuring text fits within circle
  // Font size scales with count but must fit within circle
  const maxLabelSizeByCircle = Math.floor(availableDiameter * 0.15); // Max 15% of diameter
  const maxCountSizeByCircle = Math.floor(availableDiameter * 0.12); // Max 12% of diameter
  
  // Set minimum sizes for readability
  const minLabelSize = 10;
  const minCountSize = 8;
  
  // Calculate proportional font sizes based on count (comparative scaling)
  const labelFontSizeByCount = minLabelSize + ((count / maxCount) * (maxLabelSizeByCircle - minLabelSize));
  const countFontSizeByCount = minCountSize + ((count / maxCount) * (maxCountSizeByCircle - minCountSize));
  
  // Use the smaller of: count-based size or circle-constrained size
  let labelFontSize = Math.max(
    minLabelSize,
    Math.min(maxLabelSizeByCircle, labelFontSizeByCount)
  );
  
  let countFontSize = Math.max(
    minCountSize,
    Math.min(maxCountSizeByCircle, countFontSizeByCount)
  );
  
  // Estimate text width to ensure text doesn't cross circle boundary
  const estimatedLabelWidth = label.length * (labelFontSize * 0.55); // Approximate character width
  const estimatedCountWidth = count.toLocaleString().length * (countFontSize * 0.55);
  const maxTextWidth = availableDiameter * 0.85; // Use 85% of diameter for safety margin
  
  // Scale down if text is too wide (ensure text doesn't cross circle)
  let finalLabelSize = labelFontSize;
  let finalCountSize = countFontSize;
  
  if (estimatedLabelWidth > maxTextWidth) {
    finalLabelSize = Math.max(minLabelSize, (maxTextWidth / label.length) / 0.55);
  }
  
  if (estimatedCountWidth > maxTextWidth) {
    finalCountSize = Math.max(minCountSize, (maxTextWidth / count.toLocaleString().length) / 0.55);
  }

  return (
    <div 
      className="relative" 
      style={{ position: 'relative', width: size, height: size }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Tooltip - shows full disposition name and count on hover */}
      {isHovered && (
        <div
          className="absolute z-50 bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-xl px-3 py-2 pointer-events-none"
          style={{
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
            whiteSpace: 'nowrap',
            lineHeight: '1.4',
          }}
        >
          <div className="font-semibold">{label}</div>
          <div className="text-sm opacity-90">Count: {count.toLocaleString()}</div>
          {/* Arrow pointing down */}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 dark:hidden"
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgb(17, 24, 39)', // gray-900
            }}
          />
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 hidden dark:block"
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgb(31, 41, 55)', // gray-800
            }}
          />
        </div>
      )}
      
      {/* Top handle - Incoming (connects to parent) */}
      <Handle 
        id="top"
        type="target" 
        position={Position.Top}
        style={{ 
          width: '12px', 
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#6b7280',
          border: '2px solid white',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      
      {/* Right handle - Outgoing */}
      <Handle 
        id="right"
        type="source" 
        position={Position.Right}
        style={{ 
          width: '12px', 
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#6b7280',
          border: '2px solid white',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      
      {/* Left handle - Outgoing */}
      <Handle 
        id="left"
        type="source" 
        position={Position.Left}
        style={{ 
          width: '12px', 
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#6b7280',
          border: '2px solid white',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />
      
      {/* Bottom handle - Outgoing */}
      <Handle 
        id="bottom"
        type="source" 
        position={Position.Bottom}
        style={{ 
          width: '12px', 
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#6b7280',
          border: '2px solid white',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
      
      <div
        className={`${colors.bg} ${colors.border} ${colors.text} rounded-full border-4 flex flex-col items-center justify-center shadow-lg hover:shadow-xl transition-all cursor-pointer`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          borderRadius: '50%', // Force circle shape
          borderWidth: `${borderWidth}px`,
          borderStyle: 'solid',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          position: 'relative',
        }}
      >
        <div 
          className="text-center" 
          style={{ 
            textAlign: 'center', 
            padding: `${padding}px`,
            width: '100%',
            maxWidth: `${availableDiameter}px`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <div 
            className="font-bold leading-tight mb-1 break-words" 
            style={{ 
              fontWeight: 'bold', 
              marginBottom: '0.25rem', 
              wordBreak: 'break-word',
              fontSize: `${finalLabelSize}px`,
              lineHeight: `${finalLabelSize * 1.2}px`,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {label}
          </div>
          <div 
            className="font-semibold opacity-90" 
            style={{ 
              fontWeight: '600', 
              opacity: 0.9,
              fontSize: `${finalCountSize}px`,
              lineHeight: `${finalCountSize * 1.2}px`,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {count.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

// Helper function to convert SNAKE_CASE to Title Case
const formatNodeName = (key: string): string => {
  return key.split('_').map(word => 
    word.charAt(0) + word.slice(1).toLowerCase()
  ).join(' ');
};

// Helper function to determine node type based on key
const getNodeType = (key: string): 'success' | 'failure' | 'neutral' | 'warning' | 'info' => {
  const keyUpper = key.toUpperCase();
  if (keyUpper.includes('PAID') || keyUpper.includes('PAY_FULL') || keyUpper.includes('PAY_TOKEN') || keyUpper.includes('TODAY') || keyUpper.includes('CONFIRMED')) {
    return 'success';
  } else if (keyUpper.includes('NOT_RPC') || keyUpper.includes('DROPPED') || keyUpper.includes('SILENCE') || keyUpper.includes('DISPUTE') || keyUpper.includes('CANNOT_PAY') || keyUpper.includes('REFUSAL')) {
    return 'failure';
  } else if (keyUpper.includes('CALLBACK') || keyUpper.includes('DEFERRAL') || keyUpper.includes('LATER') || keyUpper.includes('PROMISE')) {
    return 'warning';
  } else if (keyUpper.includes('ESCALATION') || keyUpper.includes('PAYMENT_OUTCOME')) {
    return 'info';
  } else if (keyUpper.includes('RPC')) {
    return 'success';
  }
  return 'neutral';
};

// Parse node from DTree.json structure (with disposotion_code and children array)
const parseDTreeNode = (
  nodeData: any,
  parentId: string | null = null,
  level: number = 0,
  nodes: DispositionNode[] = []
): DispositionNode[] => {
  // Extract node code (note: JSON has typo "disposotion_code" instead of "disposition_code")
  const nodeCode = nodeData.disposotion_code || nodeData.disposition_code || '';
  if (!nodeCode) {
    return nodes;
  }
  
  // Use dpath to create unique node ID (respects tree structure - same code can appear multiple times)
  // If dpath exists, use it; otherwise fall back to code-based ID
  const dpath = nodeData.dpath || '';
  const nodeId = dpath 
    ? dpath.toLowerCase() // Convert ABEABA to abeaba (unique path-based ID)
    : nodeCode.toLowerCase().replace(/_/g, '-');
  
  const nodeName = formatNodeName(nodeCode);
  const nodeType = getNodeType(nodeCode);
  
  // Get count from mapping using dpath if available, otherwise use code
  // Try dpath first (for unique nodes), then fall back to code
  const nodeCount = dpath && DISPOSITION_COUNTS_BY_DPATH[dpath] !== undefined
    ? DISPOSITION_COUNTS_BY_DPATH[dpath]
    : DISPOSITION_COUNTS[nodeCode] || 0;
  
  // Create node
  const node: DispositionNode = {
    id: nodeId,
    name: nodeName,
    count: nodeCount,
    level: level,
    type: nodeType,
  };
  
  if (parentId) {
    node.parent = parentId;
  }
  
  nodes.push(node);
  
  // Check if this node is final (no children)
  if (nodeData.final === true) {
    return nodes;
  }
  
  // Process children if they exist (children is an array in DTree.json)
  if (nodeData.children && Array.isArray(nodeData.children)) {
    nodeData.children.forEach((childNode: any) => {
      parseDTreeNode(childNode, nodeId, level + 1, nodes);
    });
  }
  
  return nodes;
};

// Recursively parse JSON tree structure into DispositionNode array (legacy format)
const parseJsonTree = (
  obj: any,
  parentId: string | null = null,
  level: number = 0,
  nodes: DispositionNode[] = []
): DispositionNode[] => {
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    
    // Skip metadata fields
    if (key === 'description' || key === 'classification_rules' || key === 'final' || key === 'include_if' || key === 'exclude_if') {
      return;
    }
    
    // Convert key to node ID and name
    const nodeId = key.toLowerCase().replace(/_/g, '-');
    const nodeName = formatNodeName(key);
    const nodeType = getNodeType(key);
    
    // Get count from mapping, default to 0 if not found
    const nodeCount = DISPOSITION_COUNTS[key] || 0;
    
    // Create node
    const node: DispositionNode = {
      id: nodeId,
      name: nodeName,
      count: nodeCount,
      level: level,
      type: nodeType,
    };
    
    if (parentId) {
      node.parent = parentId;
    }
    
    nodes.push(node);
    
    // Recursively process children
    if (value && typeof value === 'object') {
      // Check if value itself is marked as final (skip if so)
      if (value.final === true) {
        return;
      }
      
      if (value.children) {
        // Check if children object itself is marked as final (edge case in JSON structure)
        if (value.children.final === true) {
          // This node has no actual children, skip
          return;
        }
        // If there's a children property, process it
        parseJsonTree(value.children, nodeId, level + 1, nodes);
      } else {
        // If it's an object but not marked as final, check if it has child nodes
        const childKeys = Object.keys(value).filter(k => 
          k !== 'description' && k !== 'classification_rules' && k !== 'final' && k !== 'include_if' && k !== 'exclude_if'
        );
        if (childKeys.length > 0) {
          parseJsonTree(value, nodeId, level + 1, nodes);
        }
      }
    }
  });
  
  return nodes;
};

// Parse the disposition data from DTree.json structure
const parseDispositionData = (dTreeData?: any): DispositionNode[] => {
  const nodes: DispositionNode[] = [];
  
  // Process the disposition_tree array if provided
  if (dTreeData && dTreeData.disposition_tree && Array.isArray(dTreeData.disposition_tree) && dTreeData.disposition_tree.length > 0) {
    const rootNodeData = dTreeData.disposition_tree[0];
    
    // Create root node
    // Use dpath for root node ID to respect tree structure
    const rootCode = rootNodeData.disposotion_code || rootNodeData.disposition_code || 'CALL_CONNECTED';
    const rootDpath = rootNodeData.dpath || 'A';
    const rootId = rootDpath.toLowerCase(); // Use dpath (e.g., "a") for unique ID
    const rootName = formatNodeName(rootCode);
    // Use dpath-based count if available, otherwise fall back to code-based
    const rootCount = DISPOSITION_COUNTS_BY_DPATH[rootDpath] !== undefined
      ? DISPOSITION_COUNTS_BY_DPATH[rootDpath]
      : DISPOSITION_COUNTS[rootCode] || 156;
    
    nodes.push({
      id: rootId,
      name: rootName,
      count: rootCount,
      level: 0,
      type: 'neutral',
    });
    
    // Parse all children recursively (counts are already set in parseDTreeNode)
    if (rootNodeData.children && Array.isArray(rootNodeData.children)) {
      rootNodeData.children.forEach((childNode: any) => {
        parseDTreeNode(childNode, rootId, 1, nodes);
      });
    }
    
    return nodes;
  }
  
  // Fallback: use old hardcoded structure
  // Clear nodes array for fallback
  nodes.length = 0;
  const treeJson = {
    "CALL_CONNECTED": {
      "NOT_RPC": {
        "children": {
          "WRONG_PARTY_CONTACT": { "final": true },
          "THIRD_PARTY_CONTACT": { "final": true },
          "NO_RESPONSE_OR_SILENCE": { "final": true },
          "CALL_DROPPED_OR_NETWORK_ISSUE": { "final": true }
        }
      },
      "RPC": {
        "children": {
          "BUSY_OR_CALLBACK_REQUESTED": { "final": true },
          "CALL_DROPPED_AFTER_RPC": { "final": true },
          "SILENT_AFTER_RPC": { "final": true },
          "LOAN_INFORMATION_INCORRECT": {
            "children": {
              "LOAN_DISPUTE_NOT_MY_LOAN": { "final": true },
              "DETAILS_MISMATCH": { "final": true },
              "VERIFICATION_REQUIRED": { "final": true }
            }
          },
          "LOAN_INFO_CONFIRMED": {
            "children": {
              "PAYMENT_OUTCOME": {
                "children": {
                  "ALREADY_PAID": { "final": true },
                  "WILL_PAY_FULL": {
                    "children": {
                      "PAYMENT_TIME": {
                        "children": {
                          "TODAY": { "final": true }
                        }
                      },
                      "PAYMENT_MODE": {
                        "children": {
                          "BRANCH": { "final": true },
                          "SECURE_LINK": { "final": true },
                          "DOORSTEP": { "final": true }
                        }
                      },
                      "WILL_PAY_LATER": {
                        "children": {
                          "DATE_GIVEN_PTP": { "final": true },
                          "NO_DATE_SOFT_PROMISE": { "final": true }
                        }
                      }
                    }
                  },
                  "WILL_PAY_TOKEN": {
                    "children": {
                      "TOKEN_ELIGIBILITY": {
                        "children": {
                          "MINIMUM_TOKEN_MET": { "final": true }
                        }
                      },
                      "PAYMENT_MODE": {
                        "children": {
                          "BRANCH": { "final": true },
                          "SECURE_LINK": { "final": true },
                          "DOORSTEP": { "final": true }
                        }
                      },
                      "WILL_PAY_LATER": {
                        "children": {
                          "DATE_GIVEN_PTP": { "final": true },
                          "NO_DATE_SOFT_PROMISE": { "final": true }
                        }
                      }
                    }
                  },
                  "CANNOT_PAY": {
                    "children": {
                      "TEMPORARY_FINANCIAL_STRESS": {
                        "children": {
                          "JOB_LOSS": { "final": true },
                          "SALARY_DELAY": { "final": true },
                          "CROP_FAILURE": { "final": true },
                          "FESTIVAL_OR_SEASONAL_PRESSURE": { "final": true }
                        }
                      },
                      "MEDICAL_EMERGENCY": { "final": true },
                      "PERMANENT_INABILITY": { "final": true },
                      "FLAT_REFUSAL_OR_UNWILLING": { "final": true }
                    }
                  }
                }
              },
              "CALLBACK_OR_DEFERRAL": { 
                "children": { 
                  "final": true 
                }
              },
              "ESCALATION_OR_OVERRIDE": {
                "children": {
                  "ESCALATED_TO_HUMAN_AGENT": { "final": true }
                }
              }
            }
          }
        }
      }
    }
  };
  
  // Root node
  const rootCount = DISPOSITION_COUNTS['CALL_CONNECTED'] || 156;
  nodes.push({
    id: 'call-connected',
    name: 'Call Connected',
    count: rootCount,
    level: 0,
    type: 'neutral',
  });
  
  // Parse the tree structure (counts are already set in parseJsonTree)
  parseJsonTree(treeJson.CALL_CONNECTED, 'call-connected', 1, nodes);
  
  return nodes;
};

// Calculate which handle (right, left, or bottom) is closest to the target node
const calculateClosestHandle = (
  parentNode: Node,
  childNode: Node
): 'right' | 'left' | 'bottom' => {
  const parentX = parentNode.position.x;
  const parentY = parentNode.position.y;
  const childX = childNode.position.x;
  const childY = childNode.position.y;
  
  // Calculate circle radius based on count (same logic as CustomNode)
  const allCounts = [...Object.values(DISPOSITION_COUNTS_BY_DPATH), ...Object.values(DISPOSITION_COUNTS)];
  const maxCount = Math.max(...allCounts);
  const minRadius = 30;
  const maxRadius = 100;
  const parentCount = parentNode.data?.count || 0;
  const normalizedCount = Math.sqrt(parentCount / maxCount);
  const parentRadius = Math.max(
    minRadius,
    Math.min(maxRadius, minRadius + (normalizedCount * (maxRadius - minRadius)))
  );
  
  // Right handle position (center right of parent circle)
  const rightHandleX = parentX + parentRadius;
  const rightHandleY = parentY;
  const distToRight = Math.sqrt(
    Math.pow(childX - rightHandleX, 2) + Math.pow(childY - rightHandleY, 2)
  );
  
  // Left handle position (center left of parent circle)
  const leftHandleX = parentX - parentRadius;
  const leftHandleY = parentY;
  const distToLeft = Math.sqrt(
    Math.pow(childX - leftHandleX, 2) + Math.pow(childY - leftHandleY, 2)
  );
  
  // Bottom handle position (center bottom of parent circle)
  const bottomHandleX = parentX;
  const bottomHandleY = parentY + parentRadius;
  const distToBottom = Math.sqrt(
    Math.pow(childX - bottomHandleX, 2) + Math.pow(childY - bottomHandleY, 2)
  );
  
  // Return the handle with minimum distance (connects to nearest node)
  if (distToRight <= distToLeft && distToRight <= distToBottom) {
    return 'right';
  } else if (distToLeft <= distToBottom) {
    return 'left';
  } else {
    return 'bottom';
  }
};

// Build tree structure and calculate positions
const buildTree = (data: DispositionNode[]) => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  // Group nodes by level
  const nodesByLevel: Record<number, DispositionNode[]> = {};
  data.forEach((node) => {
    if (!nodesByLevel[node.level]) {
      nodesByLevel[node.level] = [];
    }
    nodesByLevel[node.level].push(node);
  });

  // Calculate positions
  const levelSpacing = 400; // Vertical spacing between levels (increased for larger nodes)
  const nodeSpacing = 350; // Horizontal spacing between nodes at same level (increased for larger nodes)
  const startX = 500; // Starting X position (adjusted)
  
  Object.keys(nodesByLevel).forEach((levelStr) => {
    const level = parseInt(levelStr);
    const levelNodes = nodesByLevel[level];
    const y = level * levelSpacing + 100;
    
    // Calculate total width needed
    const totalWidth = levelNodes.length * nodeSpacing;
    const startXForLevel = startX - (totalWidth / 2) + (nodeSpacing / 2);
    
    levelNodes.forEach((nodeData, index) => {
      const x = startXForLevel + index * nodeSpacing;
      
      nodes.push({
        id: nodeData.id,
        type: 'custom', // Explicitly set type
        position: { x, y },
        data: {
          label: nodeData.name,
          count: nodeData.count,
          type: nodeData.type,
        },
      });
    });
  });
  
  // Create edges after all nodes are created
  data.forEach((nodeData) => {
    if (nodeData.parent) {
      const parentExists = data.some(n => n.id === nodeData.parent);
      if (parentExists) {
        const parentNode = nodes.find(n => n.id === nodeData.parent);
        const childNode = nodes.find(n => n.id === nodeData.id);
        
        if (parentNode && childNode) {
          // Calculate closest handle
          const closestHandle = calculateClosestHandle(parentNode, childNode);
          
          edges.push({
            id: `${nodeData.parent}-${nodeData.id}`,
            source: nodeData.parent,
            target: nodeData.id,
            sourceHandle: closestHandle, // Use closest handle
            targetHandle: 'top', // Always connect to top of child
            type: 'smoothstep',
            animated: true,
            style: { 
              strokeWidth: 3,
              stroke: '#6b7280', // Gray color for visibility
            },
          });
        } else {
          console.warn(`Parent or child node not found in nodes array: parent='${nodeData.parent}', child='${nodeData.id}'`);
        }
      } else {
        console.warn(`Parent node '${nodeData.parent}' not found for node '${nodeData.id}'`);
      }
    }
  });

  // Clean up edges: remove any edges that reference non-existent nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  const validEdges = edges.filter(edge => {
    const sourceExists = nodeIds.has(edge.source);
    const targetExists = nodeIds.has(edge.target);
    
    if (!sourceExists || !targetExists) {
      console.warn(`Removing invalid edge: ${edge.id} (source exists: ${sourceExists}, target exists: ${targetExists})`);
      return false;
    }
    return true;
  });

  return { nodes, edges: validEdges };
};

export function DispositionTree({ data, readOnly = false, shareId }: DispositionTreeProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const [dTreeJson, setDTreeJson] = useState<any>(null);
  const reactFlowInstance = useRef<any>(null);
  
  // Fetch DTree.json on component mount
  useEffect(() => {
    fetch('/DTree.json')
      .then(res => res.json())
      .then(json => {
        setDTreeJson(json);
      })
      .catch(err => {
        console.error('Failed to load DTree.json:', err);
        // Will fallback to hardcoded structure
      });
  }, []);
  
  // Use provided data or default parsed data from DTree.json
  const dispositionData = useMemo(() => {
    try {
      if (data && Array.isArray(data) && data.length > 0) {
        return data;
      }
      if (dTreeJson) {
        const parsed = parseDispositionData(dTreeJson);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      // Fallback to hardcoded structure
      const fallback = parseDispositionData();
      if (fallback && Array.isArray(fallback) && fallback.length > 0) {
        return fallback;
      }
      // Last resort: return empty array with at least root node
      return [{
        id: 'call-connected',
        name: 'Call Connected',
        count: 10000,
        level: 0,
        type: 'neutral' as const,
      }];
    } catch (error) {
      console.error('Error parsing disposition data:', error);
      // Return minimal structure on error
      return [{
        id: 'call-connected',
        name: 'Call Connected',
        count: 10000,
        level: 0,
        type: 'neutral' as const,
      }];
    }
  }, [data, dTreeJson]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => {
      try {
        if (!dispositionData || !Array.isArray(dispositionData) || dispositionData.length === 0) {
          console.warn('No disposition data available, using empty tree');
          return { nodes: [], edges: [] };
        }
        const result = buildTree(dispositionData);
        console.log('🌳 Built tree:', { 
          nodes: result.nodes.length, 
          edges: result.edges.length,
          sampleEdges: result.edges.slice(0, 3).map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle
          }))
        });
        return result;
      } catch (error) {
        console.error('Error building tree:', error);
        return { nodes: [], edges: [] };
      }
    },
    [dispositionData]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const isUpdatingEdgesRef = useRef(false);
  const lastNodePositionsRef = useRef<string>('');

  // Clean up invalid edges when nodes change - more aggressive cleanup
  useEffect(() => {
    if (nodes.length > 0 && edges.length > 0) {
      const nodeIds = new Set(nodes.map(n => n.id));
      const validEdges = edges.filter(edge => {
        const sourceExists = nodeIds.has(edge.source);
        const targetExists = nodeIds.has(edge.target);
        
        if (!sourceExists || !targetExists) {
          console.warn(`Removing orphaned edge: ${edge.id} (source: ${edge.source} exists: ${sourceExists}, target: ${edge.target} exists: ${targetExists})`);
          return false;
        }
        return true;
      });
      
      // Always update edges to ensure they're valid, even if count is the same
      if (validEdges.length !== edges.length) {
        console.log(`Cleaned up ${edges.length - validEdges.length} invalid edges`);
        setEdges(validEdges);
      }
    } else if (edges.length > 0 && nodes.length === 0) {
      // If there are edges but no nodes, clear all edges
      console.log('No nodes available, clearing all edges');
      setEdges([]);
    }
  }, [nodes, edges, setEdges]); // Check actual nodes and edges, not just counts
  
  // Function to filter out invalid edges (edges that reference non-existent nodes)
  const filterValidEdges = useCallback((edgesToFilter: Edge[], nodesToCheck: Node[]) => {
    const nodeIds = new Set(nodesToCheck.map(n => n.id));
    return edgesToFilter.filter(edge => {
      const sourceExists = nodeIds.has(edge.source);
      const targetExists = nodeIds.has(edge.target);
      
      if (!sourceExists || !targetExists) {
        console.warn(`Removing invalid edge: ${edge.id} (source: ${edge.source}, target: ${edge.target})`);
        return false;
      }
      return true;
    });
  }, []);

  // Function to update edges based on current node positions
  const updateEdgesForNodes = useCallback(() => {
    // Prevent infinite loops
    if (isUpdatingEdgesRef.current) {
      return;
    }
    
    if (nodes.length === 0 || edges.length === 0) {
      return;
    }
    
    // Create a string representation of node positions
    const nodePositionsKey = nodes.map(n => `${n.id}-${Math.round(n.position.x)}-${Math.round(n.position.y)}`).join(',');
    
    // Only update if positions actually changed
    if (nodePositionsKey === lastNodePositionsRef.current) {
      return;
    }
    
    isUpdatingEdgesRef.current = true;
    lastNodePositionsRef.current = nodePositionsKey;
    
    // Use current nodes and edges from state
    setEdges((currentEdges) => {
      // First, filter out any invalid edges
      const validEdges = filterValidEdges(currentEdges, nodes);
      
      // Recalculate edges based on current node positions
      const updatedEdges = validEdges.map((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
          // Calculate closest handle for this edge
          const closestHandle = calculateClosestHandle(sourceNode, targetNode);
          
          // Only update if handle changed
          if (edge.sourceHandle === closestHandle && edge.targetHandle === 'top') {
            return edge;
          }
          
          return {
            ...edge,
            sourceHandle: closestHandle,
            targetHandle: 'top', // Always connect to top of child
          };
        }
        return edge;
      }).filter(edge => {
        // Double-check that both nodes exist
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        return sourceNode && targetNode;
      });
      
      // Reset flag after update
      setTimeout(() => {
        isUpdatingEdgesRef.current = false;
      }, 50);
      
      return updatedEdges;
    });
  }, [nodes, filterValidEdges]); // Only depend on nodes, not edges

  // Enhanced onNodesChange to also update edges when nodes are dragged
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);
      
      // Check if any change involves position updates and dragging has stopped
      const hasPositionChange = changes.some(
        (change) => change.type === 'position' && change.dragging === false
      );
      
      // If a node was dragged and released, update edges
      if (hasPositionChange) {
        // Use requestAnimationFrame to ensure nodes state is updated first
        requestAnimationFrame(() => {
          updateEdgesForNodes();
        });
      }
    },
    [onNodesChange, updateEdgesForNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Load saved positions on mount (only once)
  useEffect(() => {
    const loadSharedState = async () => {
      if (typeof window !== 'undefined' && !positionsLoaded && nodes.length > 0) {
        setPositionsLoaded(true);
        
        // Check for shareId prop first (from shared page), then URL parameters
        const shareIdToLoad = shareId || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('share') : null);
        
        if (shareIdToLoad) {
          // Try to load from backend first (JSON file) - use public API for shared pages
          try {
            const response = readOnly 
              ? await api.publicGet(`/disposition-tree/${shareIdToLoad}`)
              : await api.get(`/disposition-tree/${shareIdToLoad}`);
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.state) {
                const parsed = result.state;
                if (parsed.nodes && parsed.edges) {
                  // Ensure all nodes have the correct type
                  const nodesWithType = parsed.nodes.map((node: Node) => ({
                    ...node,
                    type: node.type || 'custom', // Ensure type is set
                  }));
                  setNodes(nodesWithType);
                  setEdges(parsed.edges);
                  return;
                }
              }
            }
          } catch (e) {
            console.error('Failed to load from backend, trying localStorage:', e);
          }
          
          // Fallback to localStorage if backend fails
          const sharedState = localStorage.getItem(`disposition-share-${shareIdToLoad}`);
          if (sharedState) {
            try {
              const parsed = JSON.parse(sharedState);
              if (parsed.nodes && parsed.edges) {
                // Ensure all nodes have the correct type
                const nodesWithType = parsed.nodes.map((node: Node) => ({
                  ...node,
                  type: node.type || 'custom', // Ensure type is set
                }));
                const nodeIds = new Set(nodesWithType.map((n: Node) => n.id));
                // Filter edges to only include those with valid source and target nodes
                const validEdges = parsed.edges.filter((edge: Edge) => {
                  return nodeIds.has(edge.source) && nodeIds.has(edge.target);
                });
                setNodes(nodesWithType);
                setEdges(validEdges);
                return;
              }
            } catch (e) {
              console.error('Failed to load shared state:', e);
            }
          }
        }
        
        // If not a shared link, try to load saved complete structure from backend (only if not readOnly)
        if (!readOnly) {
          try {
            const response = await api.get('/disposition-tree/positions');
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.positions && result.positions.length > 0) {
                // Restore complete structure with all saved data
                const restoredNodes = result.positions.map((savedNode: any) => ({
                  id: savedNode.id,
                  type: savedNode.type || 'custom',
                  position: savedNode.position,
                  data: savedNode.data || {}, // Complete data including label, count, type
                }));
                
                const restoredEdges = result.edges && Array.isArray(result.edges) ? result.edges : [];
                const nodeIds = new Set(restoredNodes.map((n: Node) => n.id));
                const validEdges = restoredEdges.filter((edge: Edge) => {
                  return nodeIds.has(edge.source) && nodeIds.has(edge.target);
                });
                
                console.log(`📂 Auto-loaded structure: ${restoredNodes.length} nodes, ${validEdges.length} edges`);
                setNodes(restoredNodes);
                setEdges(validEdges);
                return;
              }
            }
          } catch (e) {
            console.error('Failed to load from backend, trying localStorage:', e);
          }
          
          // Fallback to localStorage
          const savedPositions = localStorage.getItem('disposition-tree-positions');
          if (savedPositions) {
            try {
              const parsed = JSON.parse(savedPositions);
              if (parsed.nodes && parsed.nodes.length > 0) {
                // Restore complete structure from localStorage
                const restoredNodes = parsed.nodes.map((savedNode: any) => ({
                  id: savedNode.id,
                  type: savedNode.type || 'custom',
                  position: savedNode.position,
                  data: savedNode.data || {},
                }));
                
                const restoredEdges = parsed.edges && Array.isArray(parsed.edges) ? parsed.edges : [];
                const nodeIds = new Set(restoredNodes.map((n: Node) => n.id));
                const validEdges = restoredEdges.filter((edge: Edge) => {
                  return nodeIds.has(edge.source) && nodeIds.has(edge.target);
                });
                
                console.log(`📂 Auto-loaded from localStorage: ${restoredNodes.length} nodes, ${validEdges.length} edges`);
                setNodes(restoredNodes);
                setEdges(validEdges);
              }
            } catch (e) {
              console.error('Failed to load saved structure:', e);
            }
          }
        } else {
          // In read-only mode, if no shareId, don't try to load (shared pages should always have shareId)
          // This prevents unauthorized access attempts
          console.log('Read-only mode: No shareId provided, skipping structure load');
        }
      }
    };

    loadSharedState();
  }, [nodes.length, positionsLoaded, setNodes, setEdges]); // Run when nodes are initialized

  // Update nodes/edges when data changes (but preserve positions)
  useEffect(() => {
    try {
      if (!dispositionData || !Array.isArray(dispositionData) || dispositionData.length === 0) {
        return;
      }
      const { nodes: newNodes, edges: newEdges } = buildTree(dispositionData);
      // Preserve existing positions if available
      const nodesWithPreservedPositions = newNodes.map((newNode) => {
        const existingNode = nodes.find((n) => n.id === newNode.id);
        if (existingNode) {
          return { ...newNode, position: existingNode.position };
        }
        return newNode;
      });
      const nodeIds = new Set(nodesWithPreservedPositions.map((n: Node) => n.id));
      // Filter edges to only include those with valid source and target nodes
      const validEdges = newEdges.filter((edge: Edge) => {
        return nodeIds.has(edge.source) && nodeIds.has(edge.target);
      });
      setNodes(nodesWithPreservedPositions);
      setEdges(validEdges);
    } catch (error) {
      console.error('Error updating nodes/edges:', error);
    }
  }, [dispositionData, setNodes, setEdges]);

  // Show save confirmation modal
  const handleSaveClick = useCallback(() => {
    setShowSaveConfirmModal(true);
  }, []);

  // Save complete structure (nodes, edges, positions) to backend
  const handleSaveConfirm = useCallback(async () => {
    setShowSaveConfirmModal(false);
    setSaving(true);
    try {
      // Save complete node structure including all data (circles, counts, labels, types, positions)
      const nodesToSave = nodes.map((node) => ({
        id: node.id,
        type: node.type || 'custom',
        position: node.position,
        data: {
          ...node.data, // Includes label, count, type (circle information)
        },
      }));

      // Save complete edge structure including handles and styling
      const edgesToSave = edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type || 'smoothstep',
        animated: edge.animated !== undefined ? edge.animated : true,
        style: edge.style || { strokeWidth: 3, stroke: '#6b7280' },
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      }));

      console.log(`💾 Saving complete structure: ${nodesToSave.length} nodes, ${edgesToSave.length} edges`);

      const response = await api.post('/disposition-tree/positions/save', {
        positions: nodesToSave,
        edges: edgesToSave,
        timestamp: new Date().toISOString(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save structure');
      }

      // Also save to localStorage as backup with complete structure
      const stateToSave = {
        nodes: nodesToSave,
        edges: edgesToSave,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('disposition-tree-positions', JSON.stringify(stateToSave));

      setSaveMessage(`Structure saved successfully! (${nodesToSave.length} nodes, ${edgesToSave.length} edges)`);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      console.error('Failed to save structure:', e);
      setSaveMessage(`Failed to save structure: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [nodes, edges]);

  // Load complete structure (nodes, edges, positions) from backend
  const handleLoad = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load from backend first
      const response = await api.get('/disposition-tree/positions');
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.positions && result.positions.length > 0) {
          // Restore complete node structure with all saved data (circles, counts, positions)
          const restoredNodes = result.positions.map((savedNode: any) => ({
            id: savedNode.id,
            type: savedNode.type || 'custom',
            position: savedNode.position,
            data: savedNode.data || {}, // Complete data including label, count, type
          }));
          
          // Restore complete edge structure
          const restoredEdges = result.edges && Array.isArray(result.edges) 
            ? result.edges.map((edge: any) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                type: edge.type || 'smoothstep',
                animated: edge.animated !== undefined ? edge.animated : true,
                style: edge.style || { strokeWidth: 3, stroke: '#6b7280' },
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
              }))
            : [];
          
          // Filter edges to only include those with valid source and target nodes
          const nodeIds = new Set(restoredNodes.map((n: Node) => n.id));
          const validEdges = restoredEdges.filter((edge: Edge) => {
            return nodeIds.has(edge.source) && nodeIds.has(edge.target);
          });
          
          console.log(`📂 Loaded complete structure: ${restoredNodes.length} nodes, ${validEdges.length} edges`);
          
          setNodes(restoredNodes);
          setEdges(validEdges);
          
          setSaveMessage(`Structure loaded successfully! (${restoredNodes.length} nodes, ${validEdges.length} edges)`);
          setTimeout(() => setSaveMessage(null), 3000);
          return;
        }
      }
      
      // Fallback to localStorage if backend fails
      const savedPositions = localStorage.getItem('disposition-tree-positions');
      if (savedPositions) {
        const parsed = JSON.parse(savedPositions);
        if (parsed.nodes && parsed.nodes.length > 0) {
          // Restore complete structure from localStorage
          const restoredNodes = parsed.nodes.map((savedNode: any) => ({
            id: savedNode.id,
            type: savedNode.type || 'custom',
            position: savedNode.position,
            data: savedNode.data || {},
          }));
          
          const restoredEdges = parsed.edges && Array.isArray(parsed.edges) ? parsed.edges : [];
          
          // Filter edges to only include those with valid source and target nodes
          const nodeIds = new Set(restoredNodes.map((n: Node) => n.id));
          const validEdges = restoredEdges.filter((edge: Edge) => {
            return nodeIds.has(edge.source) && nodeIds.has(edge.target);
          });
          
          console.log(`📂 Loaded from localStorage: ${restoredNodes.length} nodes, ${validEdges.length} edges`);
          
          setNodes(restoredNodes);
          setEdges(validEdges);
          setSaveMessage(`Structure loaded from local storage! (${restoredNodes.length} nodes, ${validEdges.length} edges)`);
          setTimeout(() => setSaveMessage(null), 3000);
        } else {
          setSaveMessage('No saved structure found');
          setTimeout(() => setSaveMessage(null), 3000);
        }
      } else {
        setSaveMessage('No saved structure found');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (e) {
      console.error('Failed to load structure:', e);
      // Try localStorage as fallback
      try {
        const savedPositions = localStorage.getItem('disposition-tree-positions');
        if (savedPositions) {
          const parsed = JSON.parse(savedPositions);
          if (parsed.nodes && parsed.nodes.length > 0) {
            const restoredNodes = parsed.nodes.map((savedNode: any) => ({
              id: savedNode.id,
              type: savedNode.type || 'custom',
              position: savedNode.position,
              data: savedNode.data || {},
            }));
            
            const restoredEdges = parsed.edges && Array.isArray(parsed.edges) ? parsed.edges : [];
            const nodeIds = new Set(restoredNodes.map((n: Node) => n.id));
            const validEdges = restoredEdges.filter((edge: Edge) => {
              return nodeIds.has(edge.source) && nodeIds.has(edge.target);
            });
            
            setNodes(restoredNodes);
            setEdges(validEdges);
            setSaveMessage(`Structure loaded from local storage (backend unavailable)`);
            setTimeout(() => setSaveMessage(null), 3000);
          }
        } else {
          setSaveMessage('Failed to load structure from backend and no local backup found');
          setTimeout(() => setSaveMessage(null), 3000);
        }
      } catch (localError) {
        console.error('Failed to load from localStorage:', localError);
        setSaveMessage('Failed to load structure');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  const handleShare = useCallback(async () => {
    // Generate a unique share ID
    const shareId = `share-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare state to share
    const stateToShare = {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type || 'custom', // CRITICAL: Preserve node type
        position: node.position,
        data: node.data,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        animated: edge.animated,
        style: edge.style,
      })),
      timestamp: new Date().toISOString(),
    };
    
    try {
      // Save to backend (JSON file)
      const response = await api.post('/disposition-tree/save', {
        share_id: shareId,
        state: stateToShare,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save shared state');
      }

      // Also save to localStorage as backup
      localStorage.setItem(`disposition-share-${shareId}`, JSON.stringify(stateToShare));
      
      // Generate shareable URL
      // Generate shareable URL - point to new shared page
      const shareableUrl = `${window.location.origin}/share/${shareId}`;
      
      setShareUrl(shareableUrl);
      setShowShareModal(true);
    } catch (e) {
      console.error('Failed to save shared state:', e);
      alert(`Failed to generate share link: ${e instanceof Error ? e.message : 'Unknown error'}. Please try again.`);
    }
  }, [nodes, edges]);

  const handleCopyLink = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  // Show loading state while fetching DTree.json
  if (!dTreeJson && !data) {
    return (
      <div className="w-full h-[calc(100vh-200px)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm relative flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--primary)]" />
          <p className="text-[var(--secondary)]">Loading disposition tree...</p>
        </div>
      </div>
    );
  }

  // Ensure we have nodes before rendering ReactFlow
  if (!nodes || nodes.length === 0) {
    return (
      <div className="w-full h-[calc(100vh-200px)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm relative flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--secondary)]">No disposition data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${readOnly ? 'h-screen' : 'h-[calc(100vh-200px)]'} bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-sm relative`}>
      {/* Header with Action Buttons - Only show if not read-only */}
      {!readOnly && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 flex-wrap">
          {saveMessage && (
            <div className="px-3 py-1.5 bg-[var(--success)]/90 text-white rounded-md text-sm font-medium shadow-lg animate-pulse">
              {saveMessage}
            </div>
          )}
          <button
            onClick={handleSaveClick}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save complete structure (nodes, edges, positions)"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleLoad}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            title="Load saved structure (nodes, edges, positions)"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {loading ? 'Loading...' : 'Load'}
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:bg-[var(--primary-hover)] transition-colors text-sm font-medium shadow-lg"
            title="Share canvas with current positions"
          >
            <Share2 className="w-4 h-4" />
            Share Canvas
          </button>
        </div>
      )}

      {/* ReactFlow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={filterValidEdges(edges, nodes)}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        className="bg-[var(--background)]"
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 3, stroke: '#6b7280' },
        }}
        onNodeDragStop={() => {
          // Update edges when drag stops (with a small delay to ensure state is updated)
          setTimeout(() => {
            updateEdgesForNodes();
          }, 50);
        }}
      >
        <Background color="#e5e7eb" gap={16} />
        {!readOnly && <Controls />}
        {/* MiniMap is always visible (useful for navigation even in read-only mode) */}
        <MiniMap
          nodeColor={(node) => {
            const type = node.data?.type || 'neutral';
            const colorMap: Record<string, string> = {
              success: '#10b981',
              failure: '#ef4444',
              warning: '#f59e0b',
              info: '#3b82f6',
              neutral: '#6b7280',
            };
            return colorMap[type] || colorMap.neutral;
          }}
          className="bg-[var(--card-bg)] border border-[var(--card-border)]"
          nodeStrokeWidth={3}
        />
      </ReactFlow>

      {/* Save Confirmation Modal */}
      {showSaveConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-yellow-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                    Confirm Save Structure
                  </h3>
                  <p className="text-[var(--secondary)] mb-4">
                    Are you sure you want to save the current structure? This will overwrite the previously saved structure.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveConfirm}
                      disabled={saving}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Yes, Save
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowSaveConfirmModal(false)}
                      disabled={saving}
                      className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Share Canvas
              </h3>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareUrl(null);
                }}
                className="p-1 hover:bg-[var(--table-row-hover)] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[var(--foreground)]" />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-[var(--secondary)]">
                Share this link to allow others to view the disposition tree visualization:
              </p>
              
              <div className="flex items-center gap-2 p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md">
                <input
                  type="text"
                  value={shareUrl || ''}
                  readOnly
                  className="flex-1 bg-transparent text-[var(--foreground)] text-sm focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="p-2 hover:bg-[var(--table-row-hover)] rounded transition-colors"
                  title="Copy link"
                >
                  {copied ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Copy className="w-5 h-5 text-[var(--foreground)]" />
                  )}
                </button>
              </div>
              
              <div className="flex items-center gap-2 text-xs text-[var(--secondary)]">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Anyone with this link can view the canvas</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

