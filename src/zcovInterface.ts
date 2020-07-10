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
    data_from: ZcovEdgeData[],
    data_to: ZcovEdgeData[],
};

export interface ZcovFileData {
    file: string,
    lines: ZcovLineData[],
};

export async function loadZcovData(paths: string[]): Promise<ZcovFileData[]> {
    if (paths.length === 0) {
        return [];
    }

    return new Promise<ZcovFileData[]>((resolve, reject) => {
        const output:ZcovFileData[] = [];
        for (const path of paths) {
            const raw = readFileSync(path, "utf8");
            try {
                const data = JSON.parse(raw);
                console.log(data);
                output.push(data);
            } catch(err) {
                console.error(`json parse error: ${err}`);
                vscode.window.showErrorMessage("JSON parse error");
                reject();
                return;
            }
        }
        resolve(output);
    });
}
