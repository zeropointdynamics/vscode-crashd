import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';

// TODO: probably just move this into the HTML
const graphTypes = {
	'SourceOneLiner': 'SourceOneLiner',
	'AssemblyOneLiner': 'AssemblyOneLiner',
	'AssemblyWithContext': 'AssemblyWithContext'
};

/**
 * Manages graph dataflow webview panels
 */
export class GraphPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: GraphPanel | undefined;

	public static readonly viewType = 'graphDataflow';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionPath: string) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (GraphPanel.currentPanel) {
			GraphPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			GraphPanel.viewType,
			'CrasHD Dataflow',
			column || vscode.ViewColumn.One,
			{
				// Enable javascript in the webview
				enableScripts: true,

				// And restrict the webview to only loading content from our extension's `media` directory.
				// localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'media'))]
			}
		);

		GraphPanel.currentPanel = new GraphPanel(panel, extensionPath);
	}

	public static revive(panel: vscode.WebviewPanel, extensionPath: string) {
		GraphPanel.currentPanel = new GraphPanel(panel, extensionPath);
	}

	private constructor(panel: vscode.WebviewPanel, extensionPath: string) {
		this._panel = panel;
		this._extensionPath = extensionPath;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'goto_line':
						const line_info = message.text.split("|", 2);
						const line_number = line_info[0];
						const file = line_info[1];

						vscode.window.showInformationMessage(`File: ${file} Line: ${line_number}`);
						const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.path;
						vscode.window.showInformationMessage(`WorkspacePath: ${workspacePath}`);
						const docUri = vscode.Uri.file(workspacePath + '/' + file);
						vscode.window.showInformationMessage(`DocUri: ${docUri}`);
						// const options:vscode.TextDocumentShowOptions = {
						// 	selection: new vscode.Range(new vscode.Position(line_number-1,0), new vscode.Position(line_number-1,0))
						// }
						// vscode.window.showTextDocument(docUri, options);
						vscode.window.showTextDocument(docUri);
						return;
				}
			},
			null,
			this._disposables
		);
	}

	public doModelUpdate(data: string) {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'update_model', model: data });
	}

	public dispose() {
		GraphPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;

		// Vary the webview's content based on where it is located in the editor.
		switch (this._panel.viewColumn) {
			case vscode.ViewColumn.Two:
				this._updateForGraph(webview, 'SourceOneLiner');
				return;

			case vscode.ViewColumn.Three:
				this._updateForGraph(webview, 'SourceOneLiner');
				return;

			case vscode.ViewColumn.One:
			default:
				this._updateForGraph(webview, 'SourceOneLiner');
				return;
		}
	}

	private _updateForGraph(webview: vscode.Webview, graphName: keyof typeof graphTypes) {
		this._panel.title = graphName;
		// this._panel.webview.html = this._getHtmlForWebview(webview, graphTypes[graphName]);

		const filePath: vscode.Uri = vscode.Uri.file(path.join(this._extensionPath, 'src', 'html', 'index.html'));
		this._panel.webview.html = fs.readFileSync(filePath.fsPath, 'utf8');
	}
}