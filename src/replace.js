const {
  getReplacement,
  replace,
  resolveModuleContents,
  isCodegenComment,
  isPropertyCall,
  transformAndRequire,
} = require('./helpers')

module.exports = {
  asTag,
  asJSX,
  asFunction,
  asProgram,
  asImportCall,
  asImportDeclaration,
  asIdentifier,
}

function asProgram(transformFromAst, path, filename) {
  const {code: string} = transformFromAst(path.node)
  const replacement = getReplacement({string, filename})
  path.node.body = Array.isArray(replacement) ? replacement : [replacement]
}

function asImportDeclaration(path, filename) {
  const codegenComment = path.node.source.leadingComments
    .find(isCodegenComment)
    .value.trim()
  const {code, resolvedPath} = resolveModuleContents({
    filename,
    module: path.node.source.value,
  })
  let args
  if (codegenComment !== 'codegen') {
    args = transformAndRequire(
      `module.exports = [${codegenComment
        .replace(/codegen\((.*)\)/, '$1')
        .trim()}]`,
      filename,
    )
  }
  replace({
    path,
    string: code,
    filename: resolvedPath,
    args,
  })
}

function asIdentifier(path, filename) {
  const targetPath = path.parentPath
  switch (targetPath.type) {
    case 'TaggedTemplateExpression': {
      return asTag(targetPath, filename)
    }
    case 'CallExpression': {
      const isCallee = targetPath.get('callee') === path
      if (isCallee) {
        return asFunction(targetPath, filename)
      } else {
        return false
      }
    }
    case 'JSXOpeningElement': {
      const jsxElement = targetPath.parentPath
      return asJSX(jsxElement, filename)
    }
    case 'JSXClosingElement': {
      // ignore the closing element
      // but don't mark as unhandled (return false)
      // we already handled the opening element
      return true
    }
    case 'MemberExpression': {
      const callPath = targetPath.parentPath
      const isRequireCall = isPropertyCall(callPath, 'require')
      if (isRequireCall) {
        return asImportCall(callPath, filename)
      } else {
        return false
      }
    }
    default: {
      return false
    }
  }
}

function asImportCall(path, filename) {
  const [source, ...args] = path.get('arguments')
  const {code, resolvedPath} = resolveModuleContents({
    filename,
    module: source.node.value,
  })
  const argValues = args.map(a => {
    const result = a.evaluate()
    if (!result.confident) {
      throw new Error(
        'codegen cannot determine the value of an argument in codegen.require',
      )
    }
    return result.value
  })
  replace({path, string: code, filename: resolvedPath, args: argValues})
}

function asTag(path, filename) {
  const string = path.get('quasi').evaluate().value
  if (!string) {
    throw path.buildCodeFrameError(
      'Unable to determine the value of your codegen string',
      Error,
    )
  }
  replace({path, string, filename})
}

function asFunction(path, filename) {
  const argumentsPaths = path.get('arguments')
  const string = argumentsPaths[0].evaluate().value
  replace({
    path: argumentsPaths[0].parentPath,
    string,
    filename,
  })
}

function asJSX(path, filename) {
  const children = path.get('children')
  let string = children[0].node.expression.value
  if (children[0].node.expression.type === 'TemplateLiteral') {
    string = children[0].get('expression').evaluate().value
  }
  replace({
    path: children[0].parentPath,
    string,
    filename,
  })
}

/*
eslint
  complexity: ["error", 8]
*/
