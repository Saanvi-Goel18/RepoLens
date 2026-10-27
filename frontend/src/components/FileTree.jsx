import { useMemo, useState } from 'react';
import { Folder, FolderOpen, File } from 'lucide-react';
import './FileTree.css';

const SEVERITY_RANK = { Critical: 3, Warning: 2, Info: 1 };

function worseSeverity(a, b) {
    if (!a) return b;
    if (!b) return a;
    return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function severityColorVar(sev) {
    if (sev === 'Critical') return 'var(--red)';
    if (sev === 'Warning') return 'var(--yellow)';
    if (sev === 'Info') return 'var(--blue)';
    return 'transparent';
}

// Build a nested tree from a flat list of {path, size}, attaching the worst
// issue severity found for each file and rolling it up through every ancestor folder.
function buildTree(fileTree, severityByFile) {
    const root = { name: '', path: '', type: 'dir', children: new Map(), severity: null };

    for (const { path, size } of fileTree) {
        const parts = path.split('/');
        let node = root;
        let acc = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            acc = acc ? `${acc}/${part}` : part;
            const isLeaf = i === parts.length - 1;
            if (!node.children.has(part)) {
                node.children.set(part, {
                    name: part,
                    path: acc,
                    type: isLeaf ? 'file' : 'dir',
                    children: new Map(),
                    severity: null,
                    size: isLeaf ? size : undefined,
                });
            }
            node = node.children.get(part);
        }
        node.severity = severityByFile.get(path) || null;
    }

    function rollUp(node) {
        if (node.type === 'file') return node.severity;
        let worst = null;
        for (const child of node.children.values()) worst = worseSeverity(worst, rollUp(child));
        node.severity = worst;
        return worst;
    }
    rollUp(root);

    return root;
}

function sortedChildren(node) {
    return Array.from(node.children.values()).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

function TreeNode({ node, depth, selectedFile, onSelectFile, defaultExpandedPaths }) {
    const [expanded, setExpanded] = useState(depth === 0 || defaultExpandedPaths.has(node.path));

    if (node.type === 'file') {
        const isSelected = selectedFile === node.path;
        return (
            <div
                className={`ft-row ft-file ${isSelected ? 'ft-selected' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => onSelectFile(isSelected ? null : node.path)}
                title={node.path}
            >
                <File size={13} className="ft-icon" />
                <span className="ft-name">{node.name}</span>
                {node.severity && (
                    <span className="ft-dot" style={{ background: severityColorVar(node.severity) }} title={`${node.severity} issue`} />
                )}
            </div>
        );
    }

    const children = sortedChildren(node);

    return (
        <div>
            <div
                className="ft-row ft-dir"
                style={{ paddingLeft: `${depth * 16}px` }}
                onClick={() => setExpanded(e => !e)}
            >
                {expanded ? <FolderOpen size={13} className="ft-icon" /> : <Folder size={13} className="ft-icon" />}
                <span className="ft-name">{node.name}</span>
                {node.severity && (
                    <span className="ft-dot" style={{ background: severityColorVar(node.severity) }} title={`Contains ${node.severity.toLowerCase()} issues`} />
                )}
            </div>
            {expanded && children.map(child => (
                <TreeNode
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    selectedFile={selectedFile}
                    onSelectFile={onSelectFile}
                    defaultExpandedPaths={defaultExpandedPaths}
                />
            ))}
        </div>
    );
}

export default function FileTree({ fileTree, issues, truncated, selectedFile, onSelectFile }) {
    const { root, flaggedCount, defaultExpandedPaths } = useMemo(() => {
        const severityByFile = new Map();
        for (const issue of issues || []) {
            severityByFile.set(issue.file, worseSeverity(severityByFile.get(issue.file), issue.severity));
        }
        const root = buildTree(fileTree || [], severityByFile);

        // Auto-expand every ancestor folder of a flagged file so problems surface
        // without clicking through the whole tree first.
        const defaultExpandedPaths = new Set();
        for (const filePath of severityByFile.keys()) {
            const parts = filePath.split('/');
            let acc = '';
            for (let i = 0; i < parts.length - 1; i++) {
                acc = acc ? `${acc}/${parts[i]}` : parts[i];
                defaultExpandedPaths.add(acc);
            }
        }

        return { root, flaggedCount: severityByFile.size, defaultExpandedPaths };
    }, [fileTree, issues]);

    if (!fileTree || fileTree.length === 0) return null;

    return (
        <div className="glass-panel ft-panel">
            <div className="ft-header">
                <h3>Repository Structure</h3>
                <span className="ft-sub">
                    {fileTree.length} files shown{truncated ? ' (truncated)' : ''} · {flaggedCount} flagged
                </span>
            </div>
            <div className="ft-tree">
                {sortedChildren(root).map(child => (
                    <TreeNode
                        key={child.path}
                        node={child}
                        depth={0}
                        selectedFile={selectedFile}
                        onSelectFile={onSelectFile}
                        defaultExpandedPaths={defaultExpandedPaths}
                    />
                ))}
            </div>
        </div>
    );
}
