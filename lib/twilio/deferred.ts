/**
 * @module Voice
 * @internalapi
 */

/**
 * Deferred Promise
 */
export default class Deferred {
  /**
   * This {@link Deferred} promise
   */
  private readonly _promise: Promise<any>;

  /**
   * Rejects this promise
   */
  private _reject: (reason?: any) => void;

  /**
   * Resolves this promise
   */
  private _resolve: (value?: any) => void;

  /**
   * @constructor
   */
  constructor() {
    this._promise = new Promise<any>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  /**
   * @returns The {@link Deferred} promise
   */
  get promise(): Promise<any> {
    return this._promise;
  }

  /**
   * Rejects this promise
   */
  reject(reason?: any): void {
    this._reject(reason);
  }

  /**
   * Resolves this promise
   */
  resolve(value?: any): void {
    this._resolve(value);
  }
}
