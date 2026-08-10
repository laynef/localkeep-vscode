import * as vscode from 'vscode';
import { readDefaultModel } from './lkClient';

export class SageStatusBar {
  private _item: vscode.StatusBarItem;

  constructor(ctx: vscode.ExtensionContext) {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this._item.command = 'lk.listModels';
    this._item.tooltip = 'Click to switch Sage model';
    this.update(readDefaultModel());
    this._item.show();
    ctx.subscriptions.push(this._item);
  }

  update(model: string) {
    const short = model.split(':').slice(-1)[0] || model;
    this._item.text = `$(sparkle) Sage: ${short}`;
  }

  dispose() { this._item.dispose(); }
}
