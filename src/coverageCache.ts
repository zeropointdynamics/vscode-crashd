import { ZcovLineData, ZcovFileData } from './zcovInterface';
import { loadZcovData } from './zcovInterface';

/**
 * Cache for all data loaded using zcov. This way we don't have to reload
 * it everytime the user looks at a new file.
 */
export class CoverageCache {
    dataByFile: Map<string, ZcovFileData> = new Map();
    loadedZcovFiles: string[] = [];

    async loadZcovFiles(zcovPaths: string[]) {
        const zcovDataArray = await loadZcovData(zcovPaths);

        for (const fileData of zcovDataArray) {
            const cachedFileData = this.dataByFile.get(fileData.file);
            if (cachedFileData === undefined) {
                this.dataByFile.set(fileData.file, {
                    file: fileData.file,
                    lines: [...fileData.lines],
                });
            }
            else {
                cachedFileData.lines.push(...fileData.lines);
            }
        }
        this.loadedZcovFiles.push(...zcovPaths);
    }
};
