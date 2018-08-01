"use strict";

module powerbi.extensibility.visual.survivalCurve65DB9C0426974F3E8363EA24EA3A9954  {
    import DataViewObjectsParser = powerbi.extensibility.utils.dataview.DataViewObjectsParser;

    export class VisualSettings extends DataViewObjectsParser {
      public dataPoint: dataPointSettings = new dataPointSettings();
      }

    export class dataPointSettings {
      public defaultColor: string = "";
      public showAllDataPoints: boolean = true;
      public fill: string = "";
      public fillRule: string = "";
      public fontSize: number = 12;
     }

}
