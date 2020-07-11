import { ZcovFileData } from './zcovInterface';
import { loadZcovData } from './zcovInterface';

/**
 * Cache for all data loaded using zcov. This way we don't have to reload
 * it everytime the user looks at a new file.
 */
export class CoverageCache {
    dataByFile: Map<string, ZcovFileData> = new Map();
    graphs: Map<string, any> = new Map(); 
    loadedZcovFiles: string[] = [];

    async loadZcovFiles(zcovPath: string) {
        const zcovData = await loadZcovData(zcovPath);

        for (const fileData of zcovData.files) {
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
        for (const graph of zcovData.graphs) {
            const cachedGraph = this.graphs.get(graph["name"]);
            if (cachedGraph === undefined) {
                this.graphs.set(graph["name"], {
                    data: graph["data"],
                });
            }
            else {
                cachedGraph.data = graph["data"];
            }
        }
        this.loadedZcovFiles.push(...zcovPath);
    }
};
