import { ZcovFileData } from './zcovInterface';
import { loadZcovData } from './zcovInterface';

/**
 * Cache for all data loaded using zcov. This way we don't have to reload
 * it everytime the user looks at a new file.
 */
export class CoverageCache {
    dataByFile: Map<string, ZcovFileData> = new Map();
    graphs:any[] = [];
    loadedZcovFiles: string[] = [];

    async loadZcovFiles(zcovPath: string) {
        const zcovData = await loadZcovData(zcovPath);

        for (const fileData of zcovData.files) {
            this.dataByFile.set(fileData.file, {
                file: fileData.file,
                lines: [...fileData.lines],
            });
        }
        if (zcovData.graphs.length > 0) {
            this.graphs = zcovData.graphs;
        }
        this.loadedZcovFiles.push(zcovPath);
        console.log(this);
    }
};
