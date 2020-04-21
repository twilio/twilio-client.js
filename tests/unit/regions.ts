import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  defaultEdge,
  defaultRegion,
  deprecatedRegions,
  edgeToRegion,
  getChunderURI,
  getRegionShortcode,
  Region,
  regionShortcodes,
  regionToEdge,
} from '../../lib/twilio/regions';

describe('regions', () => {
  describe('getChunderURI', () => {
    let onDeprecated: sinon.SinonSpy;

    beforeEach(() => {
      onDeprecated = sinon.spy();
    });

    describe('with invalid parameter typings', async () => {
      [
        [null, undefined],
        [undefined, null],
        [null, null],
      ].forEach(([edge, region]) => {
        describe(`edge "${edge}" and region "${region}"`, () => {
          it('should throw', () => {
            assert.throws(() => {
              getChunderURI(edge as any, region as any);
            });
          });
        });
      });
    });

    it('should work with or without the deprecation handler', async () => {
      const uri = [
        getChunderURI(undefined, undefined, onDeprecated),
        getChunderURI(undefined, undefined),
      ];
      assert.equal(uri[0], uri[1]);
      assert.equal(uri[0], 'chunderw-vpc-gll.twilio.com');
    });

    describe('without edge or region', () => {
      it('should not call the deprecation handler', async () => {
        getChunderURI(undefined, undefined, onDeprecated);
        await new Promise(resolve => setTimeout(() => {
          assert.equal(onDeprecated.callCount, 0);
          resolve();
        }));
      });

      it('should return the default chunder uri', () => {
        const uri = getChunderURI(undefined, undefined);
        assert.equal(uri, 'chunderw-vpc-gll.twilio.com');
      });
    });

    describe('without edge and with region', () => {
      describe('for deprecated known regions', () => {
        Object.entries(deprecatedRegions).forEach(([deprecatedRegion, preferredRegion]) => {
          describe(deprecatedRegion, () => {
            it('should call the deprecation handler and recommend an edge', async () => {
              const preferredEdge = regionToEdge[preferredRegion];
              getChunderURI(undefined, deprecatedRegion, onDeprecated);

              await new Promise(resolve => setTimeout(() => {
                assert(onDeprecated.calledOnce);
                assert(onDeprecated.args[0][0].match(new RegExp(`please use \`edge\` "${preferredEdge}"`)));
                resolve();
              }));
            });

            it('should return the right chunder uri', () => {
              const uri = getChunderURI(undefined, deprecatedRegion, onDeprecated);
              assert.equal(uri, `chunderw-vpc-gll-${preferredRegion}.twilio.com`);
            });
          });
        });
      });

      describe('for nondeprecated known regions', () => {
        Object.values(Region).filter(r => r !== defaultRegion).forEach(region => {
          describe(region, () => {
            it('should call the deprecation handler and recommend an edge', async () => {
              const preferredEdge = regionToEdge[region];
              getChunderURI(undefined, region, onDeprecated);
              await new Promise(resolve => setTimeout(() => {
                assert(onDeprecated.calledOnce);
                assert(onDeprecated.args[0][0].match(new RegExp(`please use \`edge\` "${preferredEdge}"`)));
                resolve();
              }));
            });

            it('should return the right chunder uri', () => {
              const uri = getChunderURI(undefined, region, onDeprecated);
              assert.equal(uri, `chunderw-vpc-gll-${region}.twilio.com`);
            });
          });
        });
      });

      describe('for an unknown region', () => {
        it('should call the deprecation handler, but not recommend an edge', async () => {
          getChunderURI(undefined, 'foo', onDeprecated);
          await new Promise(resolve => setTimeout(() => {
            assert(onDeprecated.calledOnce);
            assert.equal(onDeprecated.args[0][0].match(new RegExp('edge', 'g')).length, 2);
            assert.equal(onDeprecated.args[0][0].match(new RegExp('please use', 'g')), null);
            resolve();
          }));
        });

        it('should return the right chunder uri', () => {
          const uri = getChunderURI(undefined, 'foo', onDeprecated);
          assert.equal(uri, 'chunderw-vpc-gll-foo.twilio.com');
        });
      });

      describe('for the default (gll) region', () => {
        it('should call the deprecation handler and recommend an edge', async () => {
          getChunderURI(undefined, 'gll', onDeprecated);
          await new Promise(resolve => setTimeout(() => {
            assert(onDeprecated.calledOnce);
            assert.equal(onDeprecated.args[0][0].match(new RegExp('edge', 'g')).length, 3);
            assert.equal(onDeprecated.args[0][0].match(new RegExp(`please use \`edge\` "roaming"`, 'g')).length, 1);
            resolve();
          }));
        });

        it('should return the right chunder uri', () => {
          const uri = getChunderURI(undefined, 'gll', onDeprecated);
          assert.equal(uri, 'chunderw-vpc-gll.twilio.com');
        });
      });
    });

    describe('with edge and without region', () => {
      describe('for known edges', () => {
        Object.entries(edgeToRegion).filter(([e]) => e !== defaultEdge).forEach(([edge, region]) => {
          describe(edge, () => {
            it('should not call the deprecation handler', async () => {
              getChunderURI(edge, undefined, onDeprecated);
              await new Promise(resolve => setTimeout(() => {
                assert(onDeprecated.notCalled);
                resolve();
              }));
            });

            it('should return the right chunder uri', () => {
              const uri = getChunderURI(edge, undefined, onDeprecated);
              assert.equal(uri, `chunderw-vpc-gll-${region}.twilio.com`);
            });
          });
        });
      });

      describe('for unknown edges', () => {
        it('should not call the deprecation handler', async () => {
          getChunderURI('foo', undefined, onDeprecated);
          await new Promise(resolve => setTimeout(() => {
            assert(onDeprecated.notCalled);
            resolve();
          }));
        });

        it('should transform the uri properly', () => {
          const uri = getChunderURI('foo', undefined, onDeprecated);
          assert.equal(uri, 'voice-js.foo.twilio.com');
        });
      });

      describe('for default (roaming) edge', () => {
        it('should not call the deprecation handler', async () => {
          getChunderURI('roaming', undefined, onDeprecated);
          await new Promise(resolve => setTimeout(() => {
            assert(onDeprecated.notCalled);
            resolve();
          }));
        });

        it('should transform the uri properly', () => {
          const uri = getChunderURI('roaming', undefined, onDeprecated);
          assert.equal(uri, 'chunderw-vpc-gll.twilio.com');
        });
      });
    });

    it('should throw an error with both', () => {
      assert.throws(() => getChunderURI('foo', 'bar', onDeprecated));
    });
  });

  describe('getRegionShortcode', () => {
    it('should return the correct region from the shortcode', () => {
      Object.entries(regionShortcodes).forEach(([shortcode, region]) => {
        const result = getRegionShortcode(shortcode);
        assert.equal(result, region);
      });
    });

    it('should return null for an unknown shortcode', () => {
      const result = getRegionShortcode('foo');
      assert.equal(result, null);
    });
  });
});
