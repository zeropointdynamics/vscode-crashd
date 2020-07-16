import { readFileSync } from 'fs';
import * as vscode from 'vscode';

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
