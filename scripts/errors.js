const fs = require('fs');
const VoiceErrors = require('@twilio/voice-errors');
const { USED_ERRORS } = require('../lib/twilio/constants');

let output = `/* tslint:disable max-classes-per-file max-line-length */
/**
 * @module Voice
 * @publicapi
 * @internal
 */

/**
 * This is a generated file. Any modifications here will be overwritten. See scripts/errors.js.
 */
import TwilioError from './twilioError';
export { TwilioError };

// TypeScript doesn't allow extending Error so we need to run constructor logic on every one of these
// individually. Ideally this logic would be run in a constructor on a TwilioError class but
// due to this limitation TwilioError is an interface.
// https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes
function construct(context: TwilioError, messageOrError?: string | Error, originalError?: Error) {
  if (typeof messageOrError === 'string') {
    context.message = messageOrError;
    if (originalError instanceof Error) {
      context.originalError = originalError;
    }
  } else if (messageOrError instanceof Error) {
    context.originalError = messageOrError;
  }
}
\n`;

const escapeQuotes = str => str.replace("'", "\\'");
const generateStringArray = arr => arr ? `[
      ${arr.map(value => `'${escapeQuotes(value)}'`).join(',\n      ')},
    ]` : '[]';

const generateDefinition = (code, subclassName, errorName, error) => `\
  export class ${errorName} extends Error implements TwilioError {
    causes: string[] = ${generateStringArray(error.causes)};
    code: number = ${code};
    description: string = '${escapeQuotes(error.description)}';
    explanation: string = '${escapeQuotes(error.explanation)}';
    solutions: string[] = ${generateStringArray(error.solutions)};

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, ${subclassName}Errors.${errorName}.prototype);
      construct(this, messageOrError, originalError);
    }
  }`;

const generateNamespace = (name, contents) => `export namespace ${name}Errors {
${contents}
}\n\n`;

let mapEntries = [];
for (const topClass of VoiceErrors) {
  for (const subclass of topClass.subclasses) {
    const subclassName = subclass.class.replace(' ', '');
    const definitions = [];
    for (const error of subclass.errors) {
      const code = (topClass.code * 1000) + ((subclass.code || 0) * 100) + error.code;
      const errorName = error.name.replace(' ', '');

      const fullName = `${subclassName}Errors.${errorName}`;
      if (USED_ERRORS.includes(fullName)) {
        const definition = generateDefinition(code, subclassName, errorName, error);
        definitions.push(definition);
        mapEntries.push(`[ ${code}, ${fullName} ]`);
      }
    }
    if (mapEntries.length && definitions.length) {
      output += generateNamespace(subclassName, definitions.join('\n\n'));
    }
  }
}

output += `export const errorsByCode: ReadonlyMap<number, any> = new Map([
  ${mapEntries.join(',\n  ')},
]);

Object.freeze(errorsByCode);\n`;

fs.writeFileSync('./lib/twilio/errors/generated.ts', output, 'utf8');
