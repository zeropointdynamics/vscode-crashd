import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as crashd from '../../extension';
import * as graphPanel from '../../graphPanel';

const testFolderLocation = '/../../../src/test/example/';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('should generate the coverage cache', async () => {
		const zcov = path.join(__dirname + testFolderLocation + 'crashd.zcov');
		await crashd.reloadZcovFile(zcov);
		const cache = crashd.crashCache
		assert.strictEqual(cache.fileData.get("vulnerable.c")?.lines.length, 12);
		assert.strictEqual(cache.graphs.length, 1);
	});

	test('should decorate source lines with color & runtime values', async () => {
		const vulnUri = vscode.Uri.file(
			path.join(__dirname + testFolderLocation + 'vulnerable.c')
		);
		const zcov = path.join(__dirname + testFolderLocation + 'crashd.zcov');

		const document = await vscode.workspace.openTextDocument(vulnUri);
		await vscode.window.showTextDocument(document);
		await sleep(500);
		await crashd.reloadZcovFile(zcov);
		let decorations: any[] = [];
		for (const editor of vscode.window.visibleTextEditors) {
			const d = await crashd.decorateEditor(editor);
			if (d != undefined) {
				decorations.push(d);
			}
		}

		assert.strictEqual(decorations.length, 1);
		assert.strictEqual(decorations[0].dataflowLineDecorations.length, 5);
		assert.strictEqual(decorations[0].execLineDecorations.length, 6);
		assert.strictEqual(decorations[0].allocLineDecorations.length, 0);
		assert.strictEqual(decorations[0].crashLineDecorations.length, 1);
		vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	});

	test('should show the graph panel', async () => {
		const extension = vscode.extensions.getExtension("zeropoint.crashd");
		if (!extension?.isActive) {
			await extension?.activate();
		}
		const context = crashd.extensionContext;
		assert.strictEqual(context != undefined, true);

		const zcov = path.join(__dirname + testFolderLocation + 'crashd.zcov');
		await crashd.reloadZcovFile(zcov);
		const cache = crashd.crashCache
		assert.strictEqual(cache.graphs.length, 1);
		await crashd.showGraph(context);
		sleep(500);
		assert.strictEqual(graphPanel.GraphPanel.currentPanel != undefined, true);
	});
});

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}