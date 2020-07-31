import * as vscode from 'vscode';
import { GraphPanel } from './graphPanel';
import { CoverageCache, ZcovLineData, ZcovFileData } from './coverageCache';

let decorations: boolean = false;
export let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {

	extensionContext = context;

	const commands: [string, any][] = [
		['crashd.show', cmd_showDecorations],
		['crashd.hide', cmd_hideDecorations],
		['crashd.reloadZcovFiles', cmd_reloadZcovFiles],
	];

	for (const item of commands) {
		context.subscriptions.push(vscode.commands.registerCommand(item[0], () => { item[1](context); }));
	}

	vscode.window.onDidChangeVisibleTextEditors(async editors => {
		if (decorations) {
			await cmd_showDecorations(context, false);
		}
	});

	vscode.workspace.onDidChangeConfiguration(async () => {
		if (decorations) {
			await cmd_showDecorations(context, false);
		}
	});

	vscode.languages.registerHoverProvider('c', {
        provideHover(document, position, token) {
			if (decorations) {
				return provideHoverEdges(document, position);
			}
        }
	});
	
	vscode.languages.registerHoverProvider('cpp', {
        provideHover(document, position, token) {
			if (decorations) {
				return provideHoverEdges(document, position);
			}
        }
	});

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
const dataflowLineColor = 'rgba(50, 40, 260, 0.4)';
const calledRulerColor = 'rgba(50, 40, 260, 0.7)';
const dataflowLinesDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	backgroundColor: dataflowLineColor,
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

export let crashCache = new CoverageCache();

async function reloadCrashDataFromPath(path: string) {
	await crashCache.loadZcovFile(path);
}

export async function reloadZcovFile(path:string|undefined = undefined) {
	if (path == undefined) {
		crashCache = new CoverageCache();
		const zcovPath = await findFile("crashd.zcov");
		if (zcovPath === undefined) {
			vscode.window.showInformationMessage('Cannot find any .zcov files.');
			return;
		}
		await reloadCrashDataFromPath(zcovPath.fsPath);
	} else {
		await reloadCrashDataFromPath(path);
	}
}

async function cmd_reloadZcovFiles(context: vscode.ExtensionContext) {
	await reloadZcovFile();
	await showDecorations(context);
}

async function cmd_hideDecorations(context: vscode.ExtensionContext) {
	for (const editor of vscode.window.visibleTextEditors) {
		editor.setDecorations(dataflowLinesDecorationType, []);
		editor.setDecorations(execLinesDecorationType, []);
		editor.setDecorations(allocLinesDecorationType, []);
		editor.setDecorations(crashLinesDecorationType, []);
	}
	decorations = false;
}

export async function showGraph(context: vscode.ExtensionContext) {
	if (!isCrashDataLoaded()) {
		await reloadZcovFile();
	}

	const graph = crashCache.graphs
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
	decorations = true;
}

async function cmd_showDecorations(context: vscode.ExtensionContext, graph:boolean = true) {
	if (!isCrashDataLoaded()) {
		await reloadZcovFile();
	}
	await showDecorations(context, graph);
}

function findCachedDataForFile(absolutePath: string): ZcovFileData | undefined {
	// Check if there is cached data for the absolute path
	const dataOfFile = crashCache.fileData.get(absolutePath);
	if (dataOfFile !== undefined) {
		return dataOfFile;
	}
	// Check if there is cached data for the base name
	// TODO: This will fail for nested files with different absolute paths
	// 		 but the same base name.
	for (const [storedPath, dataOfFile] of crashCache.fileData.entries()) {
		if (absolutePath.endsWith(storedPath)) {
			return dataOfFile;
		}
	}
	return undefined;
}

function isCrashDataLoaded() {
	return crashCache.fileData.size > 0;
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

function createDataflowLineDecoration(range: vscode.Range, lineMeta: string) {
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

class LineDecorations {
	dataflowLineDecorations: vscode.DecorationOptions[] = [];
	execLineDecorations: vscode.DecorationOptions[] = [];
	allocLineDecorations: vscode.DecorationOptions[] = [];
	crashLineDecorations: vscode.DecorationOptions[] = [];
};

function createDecorations(fileData: ZcovLineData[]): LineDecorations {
	const decorations = new LineDecorations();

	const hitLines = groupData(fileData, x => x.line_number);

	for (const lineData of hitLines.values()) {
		const lineIndex = lineData[0].line_number - 1;
		const lineMeta = lineData[0].meta;
		const lineKind = lineData[0].kind;
		const range = new vscode.Range(
			new vscode.Position(lineIndex, 0),
			new vscode.Position(lineIndex, 100000)
		);
		if (lineKind === "EXEC") {
			decorations.execLineDecorations.push(createExecLineDecoration(range, lineMeta));
		} else if (lineKind === "ALLOC"){
			decorations.allocLineDecorations.push(createAllocLineDecoration(range, lineMeta));
		} else if (lineKind === "FLOW_END"){
			decorations.crashLineDecorations.push(createCrashLineDecoration(range, lineMeta));
		} else {
			decorations.dataflowLineDecorations.push(createDataflowLineDecoration(range, lineMeta));
		}
	}

	return decorations;
}

export async function decorateEditor(editor: vscode.TextEditor) {
	const path = editor.document.uri.fsPath;
	const fileData = findCachedDataForFile(path)?.lines;
	if (fileData === undefined) {
		return new Promise(resolve => {
			resolve(undefined);
		});
	}

	const decorations = createDecorations(fileData);
	editor.setDecorations(dataflowLinesDecorationType, decorations.dataflowLineDecorations);
	editor.setDecorations(execLinesDecorationType, decorations.execLineDecorations);
	editor.setDecorations(allocLinesDecorationType, decorations.allocLineDecorations);
	editor.setDecorations(crashLinesDecorationType, decorations.crashLineDecorations);
	return new Promise(resolve => {
		resolve(decorations);
	});
}

async function provideHoverEdges(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined>{
	if (!isCrashDataLoaded()) {
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