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
				console.log(`Got state: ${state}`);
				GraphPanel.revive(webviewPanel, context.extensionPath);
			}
		});
	}
}

export function deactivate() { }

// DATAFLOW START = BRIGHTER BLUE
// CRASH = RED

// SHOULD BE A DARK BLUE
const calledLineColor = 'rgba(50, 50, 260, 0.3)';
const calledRulerColor = 'rgba(50, 50, 260, 0.7)';
const calledLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	backgroundColor: calledLineColor,
	overviewRulerColor: calledRulerColor,
});

// YELLOWISH
const execLineColorDark = 'rgba(190, 190, 40, 0.2)';
const execRulerColorDark = 'rgba(190, 190, 50, 0.5)';
const execLineColorLight = 'rgba(240, 190, 40, 0.3)';
const execRulerColorLight = 'rgba(240, 190, 50, 0.7)';
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
const execAfterLineColor = 'rgba(40, 240, 40, 0.2)';
const execAfterRulerColor = 'rgba(40, 240, 40, 0.6)';
const execAfterLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	backgroundColor: execAfterLineColor,
	overviewRulerColor: execAfterRulerColor,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

function getWorkspaceFolderConfig(workspaceFolder: vscode.WorkspaceFolder) {
	return vscode.workspace.getConfiguration('zcovViewer', workspaceFolder);
}

function getTextDocumentConfig(document: vscode.TextDocument) {
	return vscode.workspace.getConfiguration('zcovViewer', document);
}

function getBuildDirectories(): string[] {
	if (vscode.workspace.workspaceFolders === undefined) {
		return [];
	}

	const buildDirectories: string[] = [];
	const workspaceFolderPaths: string[] = [];
	for (const workspaceFolder of vscode.workspace.workspaceFolders) {
		workspaceFolderPaths.push(workspaceFolder.uri.fsPath);
	}
	buildDirectories.push(...workspaceFolderPaths);
	return buildDirectories;
}

async function getZcovPath(progress?: MyProgress, token?: vscode.CancellationToken) {
	progress?.report({ message: 'Searching for .zcov file' });
	const buildDirectories = getBuildDirectories();

	let counter = 0;
	let zcovPath = undefined;
	for (const buildDirectory of buildDirectories) {
		await findAllFilesRecursively(buildDirectory, path => {
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

function showNoFilesFoundMessage() {
	vscode.window.showInformationMessage('Cannot find any .zcov files.');
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
				showNoFilesFoundMessage();
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
		editor.setDecorations(execAfterLinesDecorationType, []);
	}
	isShowingDecorations = false;
}

// async function COMMAND_graph(context: vscode.ExtensionContext) {
// 	await showGraph(context);
// }

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
		console.log(graph);
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
	/* Check if there is cached data for the exact path. */
	const dataOfFile = coverageCache.dataByFile.get(absolutePath);
	if (dataOfFile !== undefined) {
		return dataOfFile;
	}
	/* Try to guess which cached data belongs to the given path.
	 * This might have to be improved in the future when we learn more about
	 * the ways this can fail. */
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

// function computeSum<T>(values: T[], getSummand: (value: T) => number) {
// 	return values.reduce((sum, value) => sum + getSummand(value), 0);
// }

// function sumTotalCalls(lines: ZcovLineData[]): number {
// 	return computeSum(lines, x => x.count);
// }

function createRangeForLine(lineIndex: number) {
	return new vscode.Range(
		new vscode.Position(lineIndex, 0),
		new vscode.Position(lineIndex, 100000));
}

// function createTooltipForCalledLine(lineDataByFunction: Map<string, ZcovLineData[]>) {
// 	let tooltip = '';
// 	for (const [functionName, dataArray] of lineDataByFunction.entries()) {
// 		let count = computeSum(dataArray, x => x.count);
// 		if (count > 0) {
// 			const demangledName = coverageCache.demangledNames.get(functionName)!;
// 			tooltip += `${count.toLocaleString()}x in \`${demangledName}\`\n\n`;
// 		}
// 	}
// 	return tooltip;
// }

function createExecLineDecoration(range: vscode.Range) {
	const decoration: vscode.DecorationOptions = {
		range: range,
		hoverMessage: 'This line has been executed.',
	};
	return decoration;
}

function createExecAfterLineDecoration(range: vscode.Range) {
	const decoration: vscode.DecorationOptions = {
		range: range,
		hoverMessage: 'Executed after crash dataflow ended.'
	};
	return decoration;
}

function createCalledLineDecoration(range: vscode.Range, lineMeta: string, lineDataArray: ZcovLineData[]) {
	// const lineDataByFunction = groupData(lineDataArray, x => x.function_name);
	// let tooltip = createTooltipForCalledLine(lineDataByFunction);
	const decoration: vscode.DecorationOptions = {
		range: range,
		// hoverMessage: tooltip,
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
	execAfterLineDecorations: vscode.DecorationOptions[] = [];
};

function createDecorationsForFile(linesDataOfFile: ZcovLineData[]): LineDecorationsGroup {
	const decorations = new LineDecorationsGroup();

	const hitLines = groupData(linesDataOfFile, x => x.line_number);

	for (const lineDataArray of hitLines.values()) {
		const lineIndex = lineDataArray[0].line_number - 1;
		const lineMeta = lineDataArray[0].meta;
		const lineKind = lineDataArray[0].kind;
		const range = createRangeForLine(lineIndex);
		// const totalCalls = sumTotalCalls(lineDataArray);
		if (lineKind === "EXEC") {
			decorations.execLineDecorations.push(createExecLineDecoration(range));
		} else if (lineKind === "EXEC_AFTER_FLOW_END"){
			decorations.execAfterLineDecorations.push(createExecAfterLineDecoration(range));
		} else {
			decorations.calledLineDecorations.push(createCalledLineDecoration(range, lineMeta, lineDataArray));
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

	const config = getTextDocumentConfig(editor.document);

	const decorations = createDecorationsForFile(linesDataOfFile);
	editor.setDecorations(calledLinesDecorationType, decorations.calledLineDecorations);
	editor.setDecorations(execLinesDecorationType, decorations.execLineDecorations);
	editor.setDecorations(execAfterLinesDecorationType, decorations.execAfterLineDecorations);
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
				if (lineKind != "FLOW_THROUGH" && lineKind != "FLOW_END") {
					reject();
					return;
				}
				const dataFrom = lineDataArray[0].data_from;
				const dataTo = lineDataArray[0].data_to;

				if (dataFrom != undefined) {
					const len = dataFrom.length;
					mdContent += `Data from ${len} locations.  \n`;
					for (const line of dataFrom) {
						const args = [line.file, line.line_number];
						const jumpUri = vscode.Uri.parse(
							`command:crashd.jumpTo?${encodeURIComponent(JSON.stringify(args))}`
						);
						mdContent += `- [${line.file} line ${line.line_number}](${jumpUri})  \n`;
					}
					mdContent += "\n";
				}

				if (dataTo != undefined) {
					const len = dataTo.length;
					mdContent += `Data to ${len} locations.  \n`
					for (const line of dataTo) {
						const args = [line.file, line.line_number];
						const jumpUri = vscode.Uri.parse(
							`command:crashd.jumpTo?${encodeURIComponent(JSON.stringify(args))}`
						);
						mdContent += `- [${line.file} line ${line.line_number}](${jumpUri})  \n`;
					}
				}
				const hoverContent = new vscode.MarkdownString(mdContent);
				hoverContent.isTrusted = true;
				resolve(new vscode.Hover(hoverContent));
			});
		}
	}

	return;
}