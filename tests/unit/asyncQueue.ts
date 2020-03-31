import { AsyncQueue } from '../../lib/twilio/asyncQueue';
import * as sinon from 'sinon';

describe('AsyncQueue', () => {
  let operations: AsyncQueue;
  let stub1: any;
  let stub2: any;
  let stub3: any;

  const wait = (timeout?: number) => new Promise(r => setTimeout(r, timeout || 0));

  const getAsyncMethod = (delay: number, fail?: boolean): () => Promise<any> => {
    return () => {
      return new Promise((resolve, reject) => {
        const callback = typeof fail === 'boolean' ? reject : resolve;
        setTimeout(callback, delay);
      });
    };
  };

  beforeEach(() => {
    operations = new AsyncQueue();

    stub1 = sinon.stub();
    stub2 = sinon.stub();
    stub3 = sinon.stub();
  });

  context('adding items with similar async duration', () => {
    it('should execute an operation when the queue is empty', () => {
      operations.enqueue(getAsyncMethod(10)).then(stub1);
      return wait(20).then(() => sinon.assert.calledOnce(stub1));
    });

    it('should fail an operation when the queue is empty', () => {
      operations.enqueue(getAsyncMethod(10, true)).catch(stub1);
      return wait(20).then(() => sinon.assert.calledOnce(stub1));
    });

    it('should execute an operation when the queue is not empty', () => {
      operations.enqueue(getAsyncMethod(10)).then(stub1);
      operations.enqueue(getAsyncMethod(10)).then(stub2);
      operations.enqueue(getAsyncMethod(10)).then(stub3);
      return wait(60).then(() => {
        sinon.assert.calledOnce(stub1);
        sinon.assert.calledOnce(stub2);
        sinon.assert.calledOnce(stub3);
        sinon.assert.callOrder(stub1, stub2, stub3);
      });
    });

    it('should fail an operation when the queue is not empty', () => {
      operations.enqueue(getAsyncMethod(10, true)).catch(stub1);
      operations.enqueue(getAsyncMethod(10, true)).catch(stub2);
      operations.enqueue(getAsyncMethod(10, true)).catch(stub3);
      return wait(60).then(() => {
        sinon.assert.calledOnce(stub1);
        sinon.assert.calledOnce(stub2);
        sinon.assert.calledOnce(stub3);
        sinon.assert.callOrder(stub1, stub2, stub3);
      });
    });
  });

  context('adding items with different async duration', () => {
    it('should execute an operation when the queue is not empty', () => {
      operations.enqueue(getAsyncMethod(15)).then(stub1);
      operations.enqueue(getAsyncMethod(10)).then(stub2);
      operations.enqueue(getAsyncMethod(20)).then(stub3);
      return wait(90).then(() => {
        sinon.assert.calledOnce(stub1);
        sinon.assert.calledOnce(stub2);
        sinon.assert.calledOnce(stub3);
        sinon.assert.callOrder(stub1, stub2, stub3);
      });
    });

    it('should fail an operation when the queue is not empty', () => {
      operations.enqueue(getAsyncMethod(15, true)).catch(stub1);
      operations.enqueue(getAsyncMethod(10, true)).catch(stub2);
      operations.enqueue(getAsyncMethod(25, true)).catch(stub3);
      return wait(100).then(() => {
        sinon.assert.calledOnce(stub1);
        sinon.assert.calledOnce(stub2);
        sinon.assert.calledOnce(stub3);
        sinon.assert.callOrder(stub1, stub2, stub3);
      });
    });

    it('should execute the correct order if first item is failing', () => {
      operations.enqueue(getAsyncMethod(15, true)).catch(stub1);
      operations.enqueue(getAsyncMethod(10)).then(stub2);
      operations.enqueue(getAsyncMethod(10)).then(stub3);
      return wait(70).then(() => {
        sinon.assert.calledOnce(stub1);
        sinon.assert.calledOnce(stub2);
        sinon.assert.calledOnce(stub3);
        sinon.assert.callOrder(stub1, stub2, stub3);
      });
    });

    it('should execute the correct order if next item is failing', () => {
      operations.enqueue(getAsyncMethod(15)).then(stub1);
      operations.enqueue(getAsyncMethod(10, true)).catch(stub2);
      operations.enqueue(getAsyncMethod(10, true)).catch(stub3);
      return wait(70).then(() => {
        sinon.assert.calledOnce(stub1);
        sinon.assert.calledOnce(stub2);
        sinon.assert.calledOnce(stub3);
        sinon.assert.callOrder(stub1, stub2, stub3);
      });
    });
  });
});
