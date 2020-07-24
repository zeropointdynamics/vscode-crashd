import * as vscode from 'vscode';
import { ZcovLineData, ZcovFileData } from './zcovInterface';
import { findAllFilesRecursively } from './fsScanning';
import { CoverageCache } from './coverageCache';
import { GraphPanel } from './graphPanel';

let isShowingDecorations: boolean = false;

export function activate(context: vscode.ExtensionContext) {
	const commands: [string, any][] = [
		['crashd.show', COMMAND_showDecorations],
		['crashd.hide', COMMAND_hideDecorations],
		['crashd.reloadZcovFiles', COMMAND_reloadZcovFiles],
	];

	for (const item of commands) {
		context.subscriptions.push(vscode.commands.registerCommand(item[0], () => { item[1](context); }));
	}

	vscode.window.onDidChangeVisibleTextEditors(async editors => {
		if (isShowingDecorations) {
			await COMMAND_showDecorations(context, false);
		}
	});

	vscode.workspace.onDidChangeConfiguration(async () => {
		if (isShowingDecorations) {
			await COMMAND_showDecorations(context, false);
		}
	});

	vscode.languages.registerHoverProvider('c', {
        provideHover(document, position, token) {
			if (isShowingDecorations) {
				return provideHoverEdges(document, position);
			}
        }
	});
	
	vscode.languages.registerHoverProvider('cpp', {
        provideHover(document, position, token) {
			if (isShowingDecorations) {
				return provideHoverEdges(document, position);
			}
        }
	});
	
	const command = 'crashd.jumpTo';
  	const commandHandler = (file: string, line_number: number) => {
		// vscode.window.showInformationMessage(`File: ${file} Line: ${line_number}`);
		const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.path
		const docUri = vscode.Uri.file(workspacePath + '/' + file);
		// vscode.window.showInformationMessage(`WorkspacePath: ${workspacePath}`);
		// vscode.window.showInformationMessage(`DocUri: ${docUri}`);
		const options:vscode.TextDocumentShowOptions = {
			selection: new vscode.Range(new vscode.Position(line_number-1,0), new vscode.Position(line_number-1,0))
		}
		vscode.window.showTextDocument(docUri, options);
  	};

  	context.subscriptions.push(vscode.commands.registerCommand(command, commandHandler));

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(GraphPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				GraphPanel.revive(webviewPanel, context.extensionPath);
			}
		});
	}
}

export function deactivate() { }

// SHOULD BE A DARK BLUE
const calledLineColor = 'rgba(50, 40, 260, 0.4)';
const calledRulerColor = 'rgba(50, 40, 260, 0.7)';
const calledLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	backgroundColor: calledLineColor,
	overviewRulerColor: calledRulerColor,
});

// YELLOWISH
const execLineColorDark = 'rgba(180, 180, 20, 0.2)';
const execRulerColorDark = 'rgba(180, 180, 40, 0.5)';
const execLineColorLight = 'rgba(240, 190, 30, 0.3)';
const execRulerColorLight = 'rgba(240, 190, 40, 0.7)';
const execLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	light: {
		// this color will be used in light color themes
		backgroundColor: execLineColorLight,
		overviewRulerColor: execRulerColorLight,
	},
	dark: {
		// this color will be used in dark color themes
		backgroundColor: execLineColorDark,
		overviewRulerColor: execRulerColorDark,
	}
});

// GREEN
const allocLineColor = 'rgba(20, 270, 60, 0.4)';
const allocRulerColor = 'rgba(20, 270, 60, 0.9)';
const allocLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	backgroundColor: allocLineColor,
	overviewRulerColor: allocRulerColor,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// RED
const crashLineColor = 'rgba(260, 40, 40, 0.4)';
const crashRulerColor = 'rgba(260, 40, 40, 0.9)';
const crashLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	backgroundColor: crashLineColor,
	overviewRulerColor: crashRulerColor,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

function getWorkspacePaths(): string[] {
	if (vscode.workspace.workspaceFolders === undefined) {
		return [];
	}
	const workspacePaths: string[] = [];
	for (const workspacePath of vscode.workspace.workspaceFolders) {
		workspacePaths.push(workspacePath.uri.fsPath);
	}
	return workspacePaths;
}

async function getZcovPath(progress?: MyProgress, token?: vscode.CancellationToken) {
	progress?.report({ message: 'Searching for .zcov file' });
	const workspacePaths = getWorkspacePaths();

	let counter = 0;
	let zcovPath = undefined;
	for (const workspacePath of workspacePaths) {
		await findAllFilesRecursively(workspacePath, path => {
			if (path.endsWith('.zcov')) {
				zcovPath = path;
			}
			counter++;
			progress?.report({ message: `[${counter}] Scanning.` });
		}, token);
	}

	return zcovPath;
}

let coverageCache = new CoverageCache();

type MyProgress = vscode.Progress<{ message?: string; increment?: number }>;

async function reloadCoverageDataFromPath(path: string) {
	await coverageCache.loadZcovFiles(path);
}

async function reloadZcovFile() {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: 'Reload Coverage Data',
		},
		async (progress, token) => {
			coverageCache = new CoverageCache();
			progress.report({ increment: 0 });

			const zcovPath = await getZcovPath(progress, token);
			if (zcovPath === undefined) {
				vscode.window.showInformationMessage('Cannot find any .zcov files.');
				return;
			}

			await reloadCoverageDataFromPath(zcovPath);
		}
	);
}

async function COMMAND_reloadZcovFiles(context: vscode.ExtensionContext) {
	await reloadZcovFile();
	await showDecorations(context);
}

async function COMMAND_hideDecorations(context: vscode.ExtensionContext) {
	for (const editor of vscode.window.visibleTextEditors) {
		editor.setDecorations(calledLinesDecorationType, []);
		editor.setDecorations(execLinesDecorationType, []);
		editor.setDecorations(allocLinesDecorationType, []);
		editor.setDecorations(crashLinesDecorationType, []);
	}
	isShowingDecorations = false;
}

async function showGraph(context: vscode.ExtensionContext) {
	if (!isCoverageDataLoaded()) {
		await reloadZcovFile();
	}
	
	// Access the graph by name
	const graph = coverageCache.graphs
	if (graph === undefined) {
		vscode.window.showInformationMessage('No graph data to show.');
		return;
	}

	GraphPanel.createOrShow(context.extensionPath);
	if (GraphPanel.currentPanel) {
		
		//// Fake graph data
		// GraphPanel.currentPanel.doModelUpdate('{"id": "root", "layoutOptions": {"algorithm": "layered", "elk.direction": "DOWN", "hierarchyHandling": "INCLUDE_CHILDREN"}, "children": [{"id": "group_pcre_exec.c", "children": [{"id": "pcre_exec.c6766", "layoutOptions": {"elk.direction": "DOWN"}, "labels": [{"id": "pcre_exec.c6766_label", "text": "6767      while (t < md->end_subject && !IS_NEWLINE(t)) t++;"}], "width": 490, "height": 16}, {"id": "pcre_exec.c1729", "labels": [{"id": "pcre_exec.c1729_label", "text": "1730        if ((rrc = (*PUBL(callout))(&cb)) > 0) RRETURN(MATCH_NOMATCH);"}], "width": 602, "height": 16}, {"id": "pcre_exec.c6553", "labels": [{"id": "pcre_exec.c6553_label", "text": "6554  md->start_subject = (PCRE_PUCHAR)subject;"}], "width": 386, "height": 16}, {"id": "pcre_exec.c1719", "labels": [{"id": "pcre_exec.c1719_label", "text": "1720        cb.start_match      = (int)(mstart - md->start_subject);"}], "width": 554, "height": 16}, {"id": "pcre_exec.c1547", "labels": [{"id": "pcre_exec.c1547_label", "text": "1548          mstart = md->start_match_ptr;   /* In case \\\\K reset it */"}], "width": 578, "height": 16}, {"id": "pcre_exec.c1712", "labels": [{"id": "pcre_exec.c1712_label", "text": "1713        cb.subject          = (PCRE_SPTR)md->start_subject;"}], "width": 514, "height": 16}, {"id": "pcre_exec.c3249", "labels": [{"id": "pcre_exec.c3249_label", "text": "3250        if (ecode[1] != *eptr++) RRETURN(MATCH_NOMATCH);"}], "width": 490, "height": 16}, {"id": "pcre_exec.c2109", "labels": [{"id": "pcre_exec.c2109_label", "text": "2110      break;"}], "width": 138, "height": 16}, {"id": "pcre_exec.c1935", "labels": [{"id": "pcre_exec.c1935_label", "text": "1936        md->start_match_ptr = mstart;"}], "width": 338, "height": 16}, {"id": "pcre_exec.c6935", "labels": [{"id": "pcre_exec.c6935_label", "text": "6936    rc = match(start_match, md->start_code, start_match, 2, md, NULL, 0);"}], "width": 626, "height": 16}], "edges": [{"id": "edge_pcre_exec.c1719pcre_exec.c1719", "source": "pcre_exec.c1719", "target": "pcre_exec.c1719"}, {"id": "edge_pcre_exec.c1719pcre_exec.c1712", "source": "pcre_exec.c1719", "target": "pcre_exec.c1712"}, {"id": "edge_pcre_exec.c1712pcre_exec.c6553", "source": "pcre_exec.c1712", "target": "pcre_exec.c6553"}, {"id": "edge_pcre_exec.c1712pcre_exec.c6935", "source": "pcre_exec.c1712", "target": "pcre_exec.c6935"}, {"id": "edge_pcre_exec.c6935pcre_exec.c6766", "source": "pcre_exec.c6935", "target": "pcre_exec.c6766"}, {"id": "edge_pcre_exec.c1719pcre_exec.c1547", "source": "pcre_exec.c1719", "target": "pcre_exec.c1547"}, {"id": "edge_pcre_exec.c1547pcre_exec.c1935", "source": "pcre_exec.c1547", "target": "pcre_exec.c1935"}, {"id": "edge_pcre_exec.c1935pcre_exec.c2109", "source": "pcre_exec.c1935", "target": "pcre_exec.c2109"}, {"id": "edge_pcre_exec.c2109pcre_exec.c3249", "source": "pcre_exec.c2109", "target": "pcre_exec.c3249"}, {"id": "edge_pcre_exec.c1712pcre_exec.c1712", "source": "pcre_exec.c1712", "target": "pcre_exec.c1712"}], "labels": [{"id": "group_pcre_exec.c_label", "text": "pcre_exec.c", "width": 98, "height": 16}]}, {"id": "group_pcretest.c", "layoutOptions": {"elk.direction": "DOWN"}, "children": [{"id": "pcretest.c2250", "labels": [{"id": "pcretest.c2250_label", "text": "2251  {"}], "width": 66, "height": 16}, {"id": "pcretest.c2283", "labels": [{"id": "pcretest.c2283_label", "text": "2284  HELLO_PCHARS(post_start, cb->subject, cb->start_match,"}], "width": 442, "height": 16}], "edges": [{"id": "edge_pcretest.c2283pcretest.c2250", "source": "pcretest.c2283", "target": "pcretest.c2250"}], "labels": [{"id": "group_pcretest.c_label", "text": "pcretest.c", "width": 90, "height": 16}]}], "edges": [{"id": "edge_pcretest.c2283pcre_exec.c1719", "source": "pcretest.c2283", "target": "pcre_exec.c1719"}, {"id": "edge_pcretest.c2250pcre_exec.c1729", "source": "pcretest.c2250", "target": "pcre_exec.c1729"}]}');
		
		//// Real graph data
		GraphPanel.currentPanel.doModelUpdate(graph);
	}
}

async function showDecorations(context: vscode.ExtensionContext, graph:boolean = true) {
	for (const editor of vscode.window.visibleTextEditors) {
		await decorateEditor(editor);
	}
	if (graph) {
		await showGraph(context);
	}
	isShowingDecorations = true;
}

async function COMMAND_showDecorations(context: vscode.ExtensionContext, graph:boolean = true) {
	if (!isCoverageDataLoaded()) {
		await reloadZcovFile();
	}
	await showDecorations(context, graph);
}

function findCachedDataForFile(absolutePath: string): ZcovFileData | undefined {
	// Check if there is cached data for the absolute path
	const dataOfFile = coverageCache.dataByFile.get(absolutePath);
	if (dataOfFile !== undefined) {
		return dataOfFile;
	}
	// Check if there is cached data for the base name
	// TODO: This will fail for nested files with different absolute paths
	// 		 but the same base name.
	for (const [storedPath, dataOfFile] of coverageCache.dataByFile.entries()) {
		if (absolutePath.endsWith(storedPath)) {
			return dataOfFile;
		}
	}
	return undefined;
}

function isCoverageDataLoaded() {
	return coverageCache.dataByFile.size > 0;
}

function groupData<T, Key>(values: T[], getKey: (value: T) => Key): Map<Key, T[]> {
	const map: Map<Key, T[]> = new Map();
	for (const value of values) {
		const key: Key = getKey(value);
		if (map.get(key)?.push(value) === undefined) {
			map.set(key, [value]);
		}
	}
	return map;
}

function createRangeForLine(lineIndex: number) {
	return new vscode.Range(
		new vscode.Position(lineIndex, 0),
		new vscode.Position(lineIndex, 100000));
}

function createExecLineDecoration(range: vscode.Range, lineMeta: string) {
	if (lineMeta == undefined) {
		return {range: range,};
	}
	const decoration: vscode.DecorationOptions = {
		range: range,
		renderOptions: {
			after: {
				contentText: `   ${lineMeta}`,
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
			},
		},
	};
	return decoration;
}

function createAllocLineDecoration(range: vscode.Range, lineMeta: string) {
	if (lineMeta == undefined) {
		return {range: range,};
	}
	const decoration: vscode.DecorationOptions = {
		range: range,
		renderOptions: {
			after: {
				contentText: `   ${lineMeta}`,
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
			},
		},
	};
	return decoration;
}

function createCrashLineDecoration(range: vscode.Range, lineMeta: string) {
	const decoration: vscode.DecorationOptions = {
		range: range,
		renderOptions: {
			after: {
				contentText: `   ${lineMeta}`,
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
			},
		},
	};
	return decoration;
}

function createCalledLineDecoration(range: vscode.Range, lineMeta: string) {
	const decoration: vscode.DecorationOptions = {
		range: range,
		renderOptions: {
			after: {
				contentText: `   ${lineMeta}`,
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
			},
		},
	};
	return decoration;
}

class LineDecorationsGroup {
	calledLineDecorations: vscode.DecorationOptions[] = [];
	execLineDecorations: vscode.DecorationOptions[] = [];
	allocLineDecorations: vscode.DecorationOptions[] = [];
	crashLineDecorations: vscode.DecorationOptions[] = [];
};

function createDecorationsForFile(linesDataOfFile: ZcovLineData[]): LineDecorationsGroup {
	const decorations = new LineDecorationsGroup();

	const hitLines = groupData(linesDataOfFile, x => x.line_number);

	for (const lineDataArray of hitLines.values()) {
		const lineIndex = lineDataArray[0].line_number - 1;
		const lineMeta = lineDataArray[0].meta;
		const lineKind = lineDataArray[0].kind;
		const range = createRangeForLine(lineIndex);
		if (lineKind === "EXEC") {
			decorations.execLineDecorations.push(createExecLineDecoration(range, lineMeta));
		} else if (lineKind === "ALLOC"){
			decorations.allocLineDecorations.push(createAllocLineDecoration(range, lineMeta));
		} else if (lineKind === "FLOW_END"){
			decorations.crashLineDecorations.push(createCrashLineDecoration(range, lineMeta));
		} else {
			decorations.calledLineDecorations.push(createCalledLineDecoration(range, lineMeta));
		}
	}

	return decorations;
}

async function decorateEditor(editor: vscode.TextEditor) {
	const path = editor.document.uri.fsPath;
	const linesDataOfFile = findCachedDataForFile(path)?.lines;
	if (linesDataOfFile === undefined) {
		return;
	}

	const decorations = createDecorationsForFile(linesDataOfFile);
	editor.setDecorations(calledLinesDecorationType, decorations.calledLineDecorations);
	editor.setDecorations(execLinesDecorationType, decorations.execLineDecorations);
	editor.setDecorations(allocLinesDecorationType, decorations.allocLineDecorations);
	editor.setDecorations(crashLinesDecorationType, decorations.crashLineDecorations);
}

async function provideHoverEdges(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined>{
	if (!isCoverageDataLoaded()) {
		await reloadZcovFile();
	}

	const path = document.uri.fsPath;
	const linesDataOfFile = findCachedDataForFile(path)?.lines;
	if (linesDataOfFile === undefined) {
		return;
	}

	const hitLines = groupData(linesDataOfFile, x => x.line_number);
	for (const lineDataArray of hitLines.values()) {
		const lineIndex = lineDataArray[0].line_number - 1;
		const lineKind = lineDataArray[0].kind;
		if (position.line == lineIndex ) {
			return new Promise<vscode.Hover>((resolve, reject) => {
				let mdContent = "";

				if (!["FLOW_THROUGH", "FLOW_END", "EXEC", "ALLOC"].includes(lineKind)) {
					reject();
					return;
				}

				const asm = lineDataArray[0].asm;

				if (asm && asm.length > 0) {
					mdContent += "\`\`\`asm\n";
					for (const inst of asm) {
						mdContent += `${inst}\n`
					}
					mdContent += "\`\`\`"
				} else {
					if (lineKind == "EXEC") {
						const hoverContent = new vscode.MarkdownString("This line has been executed");
						hoverContent.isTrusted = true;
						resolve(new vscode.Hover(hoverContent));
						return;
					}
					reject();
					return;
				}
				const hoverContent = new vscode.MarkdownString(mdContent);
				hoverContent.isTrusted = true;
				resolve(new vscode.Hover(hoverContent));
			});
		}
	}

	return;
}

export async function findFile(name: string) {
	let file: vscode.Uri | undefined;
	await vscode.workspace.findFiles(`**/${name}`).then((files) => {
		if (files.length >= 1) {
			if (files.length > 1) {
				vscode.window.showWarningMessage(`Found more than one file named: ${name}`);
			}
			file = files[0];
		}
	});
	return file;
}