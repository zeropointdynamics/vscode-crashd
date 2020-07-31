import { readFileSync } from 'fs';
import * as vscode from 'vscode';

// Cache for data loaded from the crashd.zcov file.
export class CrashCache {
    fileData: Map<string, ZcovFileData> = new Map();
    graphs:any[] = [];

    async loadZcovFile(zcovPath: string) {
        const zcovData = await loadZcovData(zcovPath);

        for (const fileData of zcovData.files) {
            this.fileData.set(fileData.file, {
                file: fileData.file,
                lines: [...fileData.lines],
            });
        }
        if (zcovData.graphs.length > 0) {
            this.graphs = zcovData.graphs;
        }
    }
};

export interface ZcovEdgeData {
    file: string,
    line_number: number,
};

export interface ZcovLineData {
    kind: string,
    line_number: number,
    meta: string,
    asm: string[],
    data_from: ZcovEdgeData[],
    data_to: ZcovEdgeData[],
};

export interface ZcovFileData {
    file: string,
    lines: ZcovLineData[],
};

export interface ZcovData {
    files: ZcovFileData[],
    graphs: any[],
};

export async function loadZcovData(path: string): Promise<ZcovData> {
    return new Promise<ZcovData>((resolve, reject) => {
        try {
            const raw = readFileSync(path, "utf8");
            const data = JSON.parse(raw);
            resolve(data);
        } catch(err) {
            console.error(`json parse error: ${err}`);
            vscode.window.showErrorMessage("JSON parse error");
            reject();
            return;
        }
    });
}