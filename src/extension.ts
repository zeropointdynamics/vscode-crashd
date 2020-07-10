import * as vscode from 'vscode';
import * as fs from 'fs';
import * as util from 'util';
import * as os from 'os';
import { ZcovLineData, ZcovFileData } from './zcovInterface';
import { findAllFilesRecursively } from './fsScanning';
import { splitArrayInChunks, shuffleArray } from './arrayUtils';
import { CoverageCache } from './coverageCache';


let isShowingDecorations: boolean = false;

export function activate(context: vscode.ExtensionContext) {
	const commands: [string, any][] = [
		['zcov-viewer.show', COMMAND_showDecorations],
		['zcov-viewer.hide', COMMAND_hideDecorations],
		['zcov-viewer.toggle', COMMAND_toggleDecorations],
		['zcov-viewer.reloadZcovFiles', COMMAND_reloadZcovFiles],
		['zcov-viewer.dumpPathsWithCoverageData', COMMAND_dumpPathsWithCoverageData],
	];

	for (const item of commands) {
		context.subscriptions.push(vscode.commands.registerCommand(item[0], item[1]));
	}

	vscode.window.onDidChangeVisibleTextEditors(async editors => {
		if (isShowingDecorations) {
			await COMMAND_showDecorations();
		}
	});
	vscode.workspace.onDidChangeConfiguration(async () => {
		if (isShowingDecorations) {
			await COMMAND_showDecorations();
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
		const config = getWorkspaceFolderConfig(workspaceFolder);
		const dirs = config.get<string[]>('buildDirectories');
		if (dirs !== undefined) {
			for (let dir of dirs) {
				dir = dir.replace('${workspaceFolder}', workspaceFolder.uri.fsPath);
				buildDirectories.push(dir);
			}
		}
	}
	if (buildDirectories.length === 0) {
		buildDirectories.push(...workspaceFolderPaths);
	}
	return buildDirectories;
}

async function getZcovPaths(progress?: MyProgress, token?: vscode.CancellationToken) {
	progress?.report({ message: 'Searching .zcov files' });
	const buildDirectories = getBuildDirectories();

	let counter = 0;
	const zcovPaths: Set<string> = new Set();
	for (const buildDirectory of buildDirectories) {
		await findAllFilesRecursively(buildDirectory, path => {
			if (path.endsWith('.zcov')) {
				zcovPaths.add(path);
			}
			counter++;
			progress?.report({ message: `[${counter}] Scanning (found ${zcovPaths.size}): ${path}` });
		}, token);
	}

	return Array.from(zcovPaths);
}

let coverageCache = new CoverageCache();

type MyProgress = vscode.Progress<{ message?: string; increment?: number }>;

async function reloadCoverageDataFromPaths(
	paths: string[], totalPaths: number,
	progress: MyProgress,
	token: vscode.CancellationToken) {

	/* Process multiple paths per zcov invocation to avoid some overhead.
	 * Don't process too many files at once so that the progress bar looks more active. */
	const chunks = splitArrayInChunks(paths, Math.ceil(paths.length / 30));
	for (const pathsChunk of chunks) {
		if (token.isCancellationRequested) {
			return;
		}

		await coverageCache.loadZcovFiles(pathsChunk);

		progress.report({
			increment: 100 * pathsChunk.length / totalPaths,
			message: `[${coverageCache.loadedZcovFiles.length}/${totalPaths}] Parsing`
		});
	}
}

function showNoFilesFoundMessage() {
	vscode.window.showInformationMessage('Cannot find any .zcov files.');
}

async function reloadZcovFiles() {
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			cancellable: true,
			title: 'Reload Coverage Data',
		},
		async (progress, token) => {
			coverageCache = new CoverageCache();
			progress.report({ increment: 0 });

			const zcovPaths = await getZcovPaths(progress, token);
			if (zcovPaths.length === 0) {
				showNoFilesFoundMessage();
				return;
			}

			/* Shuffle paths make the processing time of the individual chunks more similar. */
			shuffleArray(zcovPaths);
			const pathChunks = splitArrayInChunks(zcovPaths, os.cpus().length);

			/* Process chunks asynchronously, so that zcov is invoked multiple times in parallel. */
			const promises = [];
			for (const pathChunk of pathChunks) {
				promises.push(reloadCoverageDataFromPaths(
					pathChunk, zcovPaths.length, progress, token));
			}
			await Promise.all(promises);
		}
	);
}

async function COMMAND_reloadZcovFiles() {
	await reloadZcovFiles();
	await showDecorations();
}

async function COMMAND_toggleDecorations() {
	if (isShowingDecorations) {
		await COMMAND_hideDecorations();
	}
	else {
		await COMMAND_showDecorations();
	}
}

async function COMMAND_hideDecorations() {
	for (const editor of vscode.window.visibleTextEditors) {
		editor.setDecorations(calledLinesDecorationType, []);
		editor.setDecorations(execLinesDecorationType, []);
		editor.setDecorations(execAfterLinesDecorationType, []);
	}
	isShowingDecorations = false;
}

async function showDecorations() {
	for (const editor of vscode.window.visibleTextEditors) {
		await decorateEditor(editor);
	}
	isShowingDecorations = true;
}

async function COMMAND_showDecorations() {
	if (!isCoverageDataLoaded()) {
		await reloadZcovFiles();
	}
	await showDecorations();
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
	if (config.get<boolean>('highlightExecutedLines')) {
		editor.setDecorations(execLinesDecorationType, decorations.execLineDecorations);
		editor.setDecorations(execAfterLinesDecorationType, decorations.execAfterLineDecorations);
	}
	else {
		editor.setDecorations(execLinesDecorationType, []);
		editor.setDecorations(execAfterLinesDecorationType, []);
	}
}

async function COMMAND_dumpPathsWithCoverageData() {
	if (vscode.workspace.workspaceFolders === undefined) {
		return;
	}

	if (!isCoverageDataLoaded()) {
		await reloadZcovFiles();
	}

	const paths = Array.from(coverageCache.dataByFile.keys());
	paths.sort();
	const dumpedPaths = paths.join('\n');
	const document = await vscode.workspace.openTextDocument({
		content: dumpedPaths,
	});
	vscode.window.showTextDocument(document);
}

async function provideHoverEdges(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined>{
	if (!isCoverageDataLoaded()) {
		await reloadZcovFiles();
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
			vscode.window.showInformationMessage(`This is a highlighted line: ${lineIndex + 1}`);
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
					mdContent += `Data from ${len} locations.  \n`
				}

				if (dataTo != undefined) {
					const len = dataTo.length;
					mdContent += `Data to ${len} locations. `
				}

				resolve(new vscode.Hover(new vscode.MarkdownString(mdContent)));
			});
		}
	}

	return;
}