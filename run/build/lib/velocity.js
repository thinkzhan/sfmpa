(function(KISSY) {
    'use strict';

    var Velocity = (function(S) {
        var Velocity = function(asts) {
            this.asts = asts;
            this.init();
        };
        Velocity.Helper = {};
        Velocity.prototype = {
            constructor: Velocity
        };

        var hasEnumBug = !({
            toString: 1
        }.propertyIsEnumerable('toString'));

        var keys = Object.keys || function(o) {
                var result = [],
                    p, i;

                for (p in o) {
                    result.push(p);
                }

                if (hasEnumBug) {
                    for (i = enumProperties.length - 1; i >= 0; i--) {
                        p = enumProperties[i];
                        if (o.hasOwnProperty(p)) {
                            result.push(p);
                        }
                    }
                }

                return result;
            };

        //api map
        var utils = {
            forEach: S.each,
            some: S.some,
            mixin: S.extend,
            guid: S.uniqueId,
            isArray: S.isArray,
            indexOf: S.indexOf,
            // 1.2没有keys方法，考虑独立utils
            keys: keys,
            isObject: S.isObject,
            now: S.now
        };

        ! function(Helper, utils) {
            /**
             * 获取引用文本，当引用自身不存在的情况下，需要返回原来的模板字符串
             */

            function getRefText(ast) {

                var ret = ast.leader;
                var isFn = ast.args !== undefined;

                if (ast.isWraped) ret += '{';

                if (isFn) {
                    ret += getMethodText(ast);
                } else {
                    ret += ast.id;
                }

                utils.forEach(ast.path, function(ref) {
                    //不支持method并且传递参数
                    if (ref.type == 'method') {
                        ret += '.' + getMethodText(ref);
                    } else if (ref.type == 'index') {

                        var text = '';
                        var id = ref.id;

                        if (id.type === 'integer') {

                            text = id.value;

                        } else if (id.type === 'string') {

                            var sign = id.isEval ? '"' : "'";
                            text = sign + id.value + sign;

                        } else {

                            text = getRefText(id);

                        }

                        ret += '[' + text + ']';

                    } else if (ref.type == 'property') {

                        ret += '.' + ref.id;

                    }

                }, this);

                if (ast.isWraped) ret += '}';

                return ret;
            }

            function getMethodText(ref) {

                var args = [];
                var ret = '';

                utils.forEach(ref.args, function(arg) {
                    args.push(getLiteral(arg));
                });

                ret += ref.id + '(' + args.join(',') + ')';

                return ret;

            }

            function getLiteral(ast) {

                var ret = '';

                switch (ast.type) {

                    case 'string':
                        {
                            var sign = ast.isEval ? '"' : "'";
                            ret = sign + ast.value + sign;
                            break;
                        }

                    case 'integer':
                    case 'bool':
                        {
                            ret = ast.value;
                            break;
                        }

                    case 'array':
                        {
                            ret = '[';
                            var len = ast.value.length - 1;
                            utils.forEach(ast.value, function(arg, i) {
                                ret += getLiteral(arg);
                                if (i !== len) ret += ', ';
                            });
                            ret += ']';
                            break;
                        }

                    default:
                        ret = getRefText(ast)
                }

                return ret;
            }

            Helper.getRefText = getRefText;
        }(Velocity.Helper, utils);
        /** file: ./src/compile/blocks.js*/
        ! function(Velocity, utils) {

            /**
             * blocks语法处理
             */
            utils.mixin(Velocity.prototype, {
                /**
                 * 处理代码库: if foreach macro
                 */
                getBlock: function(block) {

                    var ast = block[0];
                    var ret = '';

                    if (ast.type === 'if') {
                        ret = this.getBlockIf(block);
                    } else if (ast.type === 'foreach') {
                        ret = this.getBlockEach(block);
                    } else if (ast.type === 'macro') {
                        this.setBlockMacro(block);
                    } else if (ast.type === 'noescape') {
                        ret = this._render(block.slice(1));
                    } else {
                        ret = this._render(block);
                    }

                    return ret || '';
                },

                /**
                 * define macro
                 */
                setBlockMacro: function(block) {
                    var ast = block[0];
                    var _block = block.slice(1);
                    var macros = this.macros;

                    macros[ast.id] = {
                        asts: _block,
                        args: ast.args
                    };
                },

                /**
                 * parse macro call
                 */
                getMacro: function(ast) {
                    var macro = this.macros[ast.id];
                    var ret = '';

                    if (!macro) {

                        var jsmacros = this.jsmacros;
                        macro = jsmacros[ast.id];
                        var jsArgs = [];

                        if (macro && macro.apply) {

                            utils.forEach(ast.args, function(a) {
                                jsArgs.push(this.getLiteral(a));
                            }, this);

                            ret = macro.apply(this, jsArgs);

                        }

                    } else {
                        var asts = macro.asts;
                        var args = macro.args;
                        var _call_args = ast.args;
                        var local = {};
                        var localKey = [];
                        var guid = utils.guid();
                        var contextId = ast.id + ':' + guid;

                        utils.forEach(args, function(ref, i) {
                            if (_call_args[i]) {
                                local[ref.id] = this.getLiteral(_call_args[i]);
                            } else {
                                local[ref.id] = undefined;
                            }
                        }, this);

                        ret = this.eval(asts, local, contextId);
                    }

                    return ret;
                },

                /**
                 * eval
                 * @param str {array|string} 需要解析的字符串
                 * @param local {object} 局部变量
                 * @param contextId {string}
                 * @return {string}
                 */
                eval: function(str, local, contextId) {

                    if (!local) {

                        if (utils.isArray(str)) {
                            return this._render(str);
                        } else {
                            return this.evalStr(str);
                        }

                    } else {

                        var asts = [];
                        var Parser = Velocity.Parser;
                        contextId = contextId || ('eval:' + utils.guid());

                        if (utils.isArray(str)) {

                            asts = str;

                        } else if (Parser) {

                            asts = Parser.parse(str);

                        }

                        if (asts.length) {

                            this.local[contextId] = local;
                            var ret = this._render(asts, contextId);
                            this.local[contextId] = {};
                            this.conditions.pop();
                            this.condition = '';

                            return ret;
                        }

                    }

                },

                /**
                 * parse #foreach
                 */
                getBlockEach: function(block) {

                    var ast = block[0];
                    var _from = this.getLiteral(ast.from);
                    var _block = block.slice(1);
                    var _to = ast.to;
                    var local = {
                        foreach: {
                            count: 0
                        }
                    };
                    var ret = '';
                    var guid = utils.guid();
                    var contextId = 'foreach:' + guid;

                    var type = ({}).toString.call(_from);
                    if (!_from || (type !== '[object Array]' && type !== '[object Object]')) return;

                    var len = utils.isArray(_from) ? _from.length : utils.keys(_from).length;

                    utils.forEach(_from, function(val, i) {

                        if (this.setBreak) return;
                        //构造临时变量
                        local[_to] = val;
                        //TODO: here, the foreach variable give to local, when _from is not an
                        //array, count and hasNext would be undefined, also i is not the
                        //index.
                        local['foreach']['count'] = i + 1;
                        local['foreach']['index'] = i;
                        local['foreach']['hasNext'] = i + 1 < len;
                        local['velocityCount'] = parseInt(i, 10) + 1;
                        this.local[contextId] = local;
                        ret += this._render(_block, contextId);

                    }, this);

                    this.setBreak = false;
                    //删除临时变量
                    this.local[contextId] = {};
                    this.conditions.shift();
                    this.condition = this.conditions[0] || '';

                    return ret;

                },

                /**
                 * parse #if
                 */
                getBlockIf: function(block) {

                    var str = '';
                    var received = false;
                    var asts = [];

                    utils.some(block, function(ast) {

                        if (ast.condition) {

                            if (received) return true;
                            received = this.getExpression(ast.condition);

                        } else if (ast.type === 'else') {
                            if (received) return true;
                            received = true;
                        } else if (received) {
                            asts.push(ast);
                        }

                        return false;

                    }, this);

                    return this._render(asts);
                }
            });
        }(Velocity, utils);

        /** file: ./src/compile/compile.js*/
        ! function(Velocity, utils) {

            /**
             * compile
             */
            utils.mixin(Velocity.prototype, {
                init: function() {
                    this.context = {};
                    this.macros = {};
                    this.conditions = [];
                    this.local = {};
                    this.silence = false;

                    utils.forEach(this.asts, this._init, this);
                },

                _init: function(ast, i) {
                    if (!ast.type || ast.type !== 'references') {
                        this._trim(i + 1);
                    }
                },

                /**
                 * 删除多余的换行符，规则，所有非references的指令后面的换行符，都去除接下来的
                 * 换行符
                 */
                _trim: function(i) {
                    var asts = this.asts;
                    var _ast = asts[i];
                    if (typeof _ast === 'string' && _ast.slice(0, 1) === "\n") {
                        asts[i] = _ast.slice(1);
                    }
                },

                /**
                 * @param context {object} 上下文环境，数据对象
                 * @param macro   {object} self defined #macro
                 * @param silent {bool} 如果是true，$foo变量将原样输出
                 * @return str
                 */
                render: function(context, macros, silence) {

                    this.silence = !! silence;
                    this.context = context || {};
                    this.jsmacros = macros || {};
                    var t1 = utils.now();
                    var str = this._render();
                    var t2 = utils.now();
                    var cost = t2 - t1;

                    this.cost = cost;

                    return str;
                },

                /**
                 * 解析入口函数
                 * @param ast {array} 模板结构数组
                 * @param contextId {number} 执行环境id，对于macro有局部作用域，变量的设置和
                 * 取值，都放在一个this.local下，通过contextId查找
                 * @return {string}解析后的字符串
                 */
                _render: function(asts, contextId) {

                    var str = '';
                    asts = asts || this.asts;

                    if (contextId) {

                        if (contextId !== this.condition &&
                            utils.indexOf(contextId, this.conditions) === -1) {
                            this.conditions.unshift(contextId);
                        }

                        this.condition = contextId;

                    } else {
                        this.condition = null;
                    }

                    utils.forEach(asts, function(ast) {

                        switch (ast.type) {
                            case 'references':
                                str += this.getReferences(ast, true);
                                break;

                            case 'set':
                                this.setValue(ast);
                                break;

                            case 'break':
                                this.setBreak = true;
                                break;

                            case 'macro_call':
                                str += this.getMacro(ast);
                                break;

                            case 'comment':
                                break;

                            default:
                                str += typeof ast == 'string' ? ast : this.getBlock(ast);
                                break;
                        }
                    }, this);

                    return str;
                }
            });
        }(Velocity, utils);

        /** file: ./src/compile/expression.js*/
        ! function(Velocity, utils) {
            /**
             * expression运算
             */
            utils.mixin(Velocity.prototype, {
                /**
                 * 表达式求值，表达式主要是数学表达式，逻辑运算和比较运算，到最底层数据结构，
                 * 基本数据类型，使用 getLiteral求值，getLiteral遇到是引用的时候，使用
                 * getReferences求值
                 */
                getExpression: function(ast) {

                    var exp = ast.expression;
                    var ret;
                    if (ast.type === 'math') {

                        switch (ast.operator) {
                            case '+':
                                ret = this.getExpression(exp[0]) + this.getExpression(exp[1]);
                                break;

                            case '-':
                                ret = this.getExpression(exp[0]) - this.getExpression(exp[1]);
                                break;

                            case '/':
                                ret = this.getExpression(exp[0]) / this.getExpression(exp[1]);
                                break;

                            case '%':
                                ret = this.getExpression(exp[0]) % this.getExpression(exp[1]);
                                break;

                            case '*':
                                ret = this.getExpression(exp[0]) * this.getExpression(exp[1]);
                                break;

                            case '||':
                                ret = this.getExpression(exp[0]) || this.getExpression(exp[1]);
                                break;

                            case '&&':
                                ret = this.getExpression(exp[0]) && this.getExpression(exp[1]);
                                break;

                            case '>':
                                ret = this.getExpression(exp[0]) > this.getExpression(exp[1]);
                                break;

                            case '<':
                                ret = this.getExpression(exp[0]) < this.getExpression(exp[1]);
                                break;

                            case '==':
                                ret = this.getExpression(exp[0]) == this.getExpression(exp[1]);
                                break;

                            case '>=':
                                ret = this.getExpression(exp[0]) >= this.getExpression(exp[1]);
                                break;

                            case '<=':
                                ret = this.getExpression(exp[0]) <= this.getExpression(exp[1]);
                                break;

                            case '!=':
                                ret = this.getExpression(exp[0]) != this.getExpression(exp[1]);
                                break;

                            case 'minus':
                                ret = -this.getExpression(exp[0]);
                                break;

                            case 'not':
                                ret = !this.getExpression(exp[0]);
                                break;

                            case 'parenthesis':
                                ret = this.getExpression(exp[0]);
                                break;

                            default:
                                return;
                                // code
                        }

                        return ret;
                    } else {
                        return this.getLiteral(ast);
                    }
                }
            });
        }(Velocity, utils);

        /** file: ./src/compile/literal.js*/
        ! function(Velocity, utils) {
            /**
             * literal解释模块
             * @require {method} getReferences
             */
            utils.mixin(Velocity.prototype, {
                /**
                 * 字面量求值，主要包括string, integer, array, map四种数据结构
                 * @param literal {object} 定义于velocity.yy文件，type描述数据类型，value属性
                 * 是literal值描述
                 * @return {object|string|number|array}返回对应的js变量
                 */
                getLiteral: function(literal) {

                    var type = literal.type;
                    var ret = '';

                    if (type == 'string') {

                        ret = this.getString(literal);

                    } else if (type == 'integer') {

                        ret = parseInt(literal.value, 10);

                    } else if (type == 'decimal') {

                        ret = parseFloat(literal.value, 10);

                    } else if (type == 'array') {

                        ret = this.getArray(literal);

                    } else if (type == 'map') {

                        ret = {};
                        var map = literal.value;

                        utils.forEach(map, function(exp, key) {
                            ret[key] = this.getLiteral(exp);
                        }, this);
                    } else if (type == 'bool') {

                        if (literal.value === "null") {
                            ret = null;
                        } else if (literal.value === 'false') {
                            ret = false;
                        } else if (literal.value === 'true') {
                            ret = true;
                        }

                    } else {

                        return this.getReferences(literal);

                    }

                    return ret;
                },

                /**
                 * 对字符串求值，对已双引号字符串，需要做变量替换
                 */
                getString: function(literal) {
                    var val = literal.value;
                    var ret = val;

                    if (literal.isEval && (val.indexOf('#') !== -1 || val.indexOf("$") !== -1)) {
                        ret = this.evalStr(val);
                    }

                    return ret;
                },

                /**
                 * 对array字面量求值，比如[1, 2]=> [1,2]，[1..5] => [1,2,3,4,5]
                 * @param literal {object} array字面量的描述对象，分为普通数组和range数组两种
                 * ，和js基本一致
                 * @return {array} 求值得到的数组
                 */
                getArray: function(literal) {

                    var ret = [];

                    if (literal.isRange) {

                        var begin = literal.value[0];
                        if (begin.type === 'references') {
                            begin = this.getReferences(begin);
                        }

                        var end = literal.value[1];
                        if (end.type === 'references') {
                            end = this.getReferences(end);
                        }

                        end = parseInt(end, 10);
                        begin = parseInt(begin, 10);

                        var i;

                        if (!isNaN(begin) && !isNaN(end)) {

                            if (begin < end) {
                                for (i = begin; i <= end; i++) ret.push(i);
                            } else {
                                for (i = begin; i >= end; i--) ret.push(i);
                            }
                        }

                    } else {
                        utils.forEach(literal.value, function(exp) {
                            ret.push(this.getLiteral(exp));
                        }, this);
                    }

                    return ret;
                },

                /**
                 * 对双引号字符串进行eval求值，替换其中的变量，只支持最基本的变量类型替换
                 */
                evalStr: function(str) {

                    // 如果是Broswer环境，使用正则执行evalStr，如果是node环境，或者自行设置
                    // Velocity.Parser = Parser，可以对evalStr完整支持
                    if (Velocity.Parser) {

                        var asts = Velocity.Parser.parse(str);
                        ret = this._render(asts);

                    } else {

                        var ret = str;
                        var reg = /\$\{{0,1}([_a-z][a-z_\-0-9.]*)\}{0,1}/gi;
                        var self = this;
                        ret = ret.replace(reg, function() {
                            return self._getFromVarname(arguments[1]);
                        });
                    }

                    return ret;
                },

                /**
                 * 通过变量名获取变量的值
                 * @param varname {string} 变量名，比如$name.name，只支持一种形式，变量和属性
                 * 的取值，index和method不支持，在字符处理中，只处理"$varname1 $foo.bar" 类似
                 * 的变量，对于复杂类型不支持
                 * @return ret {string} 变量对应的值
                 */
                _getFromVarname: function(varname) {
                    var varPath = varname.split('.');
                    var ast = {
                        type: "references",
                        id: varPath[0],
                        leader: "$"
                    };

                    var path = [];
                    for (var i = 1; i < varPath.length; i++) {
                        path.push({
                            type: 'property',
                            id: varPath[i]
                        });
                    }

                    if (path.length) ast.path = path;
                    return this.getReferences(ast);
                }

            });
        }(Velocity, utils);

        /** file: ./src/compile/references.js*/
        ! function(Velocity, utils) {

            function getSize(obj) {

                if (utils.isArray(obj)) {
                    return obj.length;
                } else if (utils.isObject(obj)) {
                    return utils.keys(obj).length;
                }

                return undefined;
            }

            utils.mixin(Velocity.prototype, {
                /**
                 * 引用求值
                 * @param {object} ast 结构来自velocity.yy
                 * @param {bool} isVal 取值还是获取字符串，两者的区别在于，求值返回结果，求
                 * 字符串，如果没有返回变量自身，比如$foo
                 */
                getReferences: function(ast, isVal) {

                    var isSilent = this.silence || ast.leader === "$!";
                    var isfn = ast.args !== undefined;
                    var context = this.context;
                    var ret = context[ast.id];
                    var local = this.getLocal(ast);


                    if (ret !== undefined && isfn) {
                        ret = this.getPropMethod(ast, context);
                    }

                    if (local.isLocaled) ret = local['value'];

                    // 如果是$page.setTitle('xx')类似的方法，需要设置page为对象
                    var isSet = this.hasSetMethod(ast, ret);
                    if (isSet !== false) {
                        if (!context[ast.id]) context[ast.id] = {};
                        utils.mixin(context[ast.id], isSet);
                        return '';
                    }

                    if (ast.path && ret !== undefined) {
                        utils.some(ast.path, function(property, i) {
                            ret = this.getAttributes(property, ret);
                            return ret === undefined;
                        }, this);
                    }

                    if (isVal && ret === undefined) ret = isSilent ? '' : Velocity.Helper.getRefText(ast);
                    return ret;
                },

                /**
                 * set方法需要单独处理，假设set只在references最后$page.setTitle('')
                 * 对于set连缀的情况$page.setTitle('sd').setName('haha')
                 */
                hasSetMethod: function(ast, context) {
                    var tools = {
                        'control': true
                    };
                    var len = ast.path && ast.path.length;
                    if (!len || tools[ast.id]) return false;

                    var lastId = '' + ast.path[len - 1].id;

                    if (lastId.indexOf('set') !== 0) {
                        return false;
                    } else {

                        context = context || {};
                        utils.forEach(ast.path, function(ast) {
                            if (ast.type === 'method' && ast.id.indexOf('set') === 0) {
                                //if (context[ast.id]) { }
                                context[ast.id.slice(3)] = this.getLiteral(ast.args[0]);
                            } else {
                                context[ast.id] = context[ast.id] || {};
                            }
                        }, this);

                        return context;
                    }
                },

                /**
                 * 获取局部变量，在macro和foreach循环中使用
                 */
                getLocal: function(ast) {

                    var id = ast.id;
                    var local = this.local;
                    var ret = false;

                    var isLocaled = utils.some(this.conditions, function(contextId) {
                        var _local = local[contextId];
                        if (id in _local) {
                            ret = _local[id];
                            return true;
                        }

                        return false;
                    }, this);

                    return {
                        value: ret,
                        isLocaled: isLocaled
                    };
                },
                /**
                 * $foo.bar 属性求值
                 */
                getAttributes: function(property, baseRef) {
                    /**
                     * type对应着velocity.yy中的attribute，三种类型: method, index, property
                     */
                    var type = property.type;
                    var ret;
                    var id = property.id;
                    if (type === 'method') {
                        ret = this.getPropMethod(property, baseRef);
                    } else if (type === 'property') {
                        ret = baseRef[id];
                    } else {
                        ret = this.getPropIndex(property, baseRef);
                    }
                    return ret;
                },

                /**
                 * $foo.bar[1] index求值
                 */
                getPropIndex: function(property, baseRef) {
                    var ast = property.id;
                    var key;
                    if (ast.type === 'references') {
                        key = this.getReferences(ast);
                    } else if (ast.type === 'integer') {
                        key = ast.value;
                    } else {
                        key = ast.value;
                    }

                    return baseRef[key];
                },

                /**
                 * $foo.bar()求值
                 */
                getPropMethod: function(property, baseRef) {

                    var id = property.id;
                    var ret = '';
                    var _id = id.slice(3);

                    if (id.indexOf('get') === 0 && !(id in baseRef)) {

                        if (_id) {
                            ret = baseRef[_id];
                        } else {
                            //map 对应的get方法
                            _id = this.getLiteral(property.args[0]);
                            ret = baseRef[_id];
                        }

                        return ret;

                    } else if (id.indexOf('is') === 0 && !(id in baseRef)) {

                        _id = id.slice(2);
                        ret = baseRef[_id];
                        return ret;

                    } else if (id === 'keySet') {

                        return utils.keys(baseRef);

                    } else if (id === 'entrySet') {

                        ret = [];
                        utils.forEach(baseRef, function(value, key) {
                            ret.push({
                                key: key,
                                value: value
                            });
                        });

                        return ret;

                    } else if (id === 'size') {

                        return getSize(baseRef);

                    } else {

                        ret = baseRef[id];
                        var args = [];

                        utils.forEach(property.args, function(exp) {
                            args.push(this.getLiteral(exp));
                        }, this);

                        if (ret && ret.call) {

                            var that = this;
                            baseRef.eval = function() {
                                return that.eval.apply(that, arguments);
                            };
                            ret = ret.apply(baseRef, args);

                        } else {
                            ret = undefined;
                        }
                    }

                    return ret;
                }
            });
        }(Velocity, utils);

        /** file: ./src/compile/set.js*/
        ! function(Velocity, utils) {
            /**
             * 变量设置
             */
            utils.mixin(Velocity.prototype, {
                /**
                 * 获取执行环境，对于macro中定义的变量，为局部变量，不贮存在全局中，执行后销毁
                 */
                getContext: function() {
                    var condition = this.condition;
                    var local = this.local;
                    if (condition) {
                        return local[condition];
                    } else {
                        return this.context;
                    }
                },
                /**
                 * parse #set
                 */
                setValue: function(ast) {
                    var ref = ast.equal[0];
                    var context = this.context; // 暂时只能set全局变量，var context = this.getContext();
                    var valAst = ast.equal[1];
                    var val;

                    if (valAst.type === 'math') {
                        val = this.getExpression(valAst);
                    } else {
                        val = this.getLiteral(ast.equal[1]);
                    }

                    if (!ref.path) {

                        context[ref.id] = val;

                    } else {

                        var baseRef = context[ref.id];
                        if (typeof baseRef != 'object') {
                            baseRef = {};
                        }

                        context[ref.id] = baseRef;
                        var len = ref.path ? ref.path.length : 0;

                        //console.log(val);
                        utils.forEach(ref.path, function(exp, i) {

                            var isEnd = len === i + 1;
                            var key = exp.id;
                            if (exp.type === 'index') {
                                if (key.type === 'references') {
                                    key.value = context[key.id];
                                }
                                key = key.value;
                            }
                            baseRef[key] = isEnd ? val : {};
                            baseRef = baseRef[key];

                        });

                    }
                }
            });
        }(Velocity, utils);

        return Velocity;
    }(KISSY));

    var velocity = (function(S) {
        /* Jison generated parser */
        var velocity = (function() {
            var parser = {
                trace: function trace() {},
                yy: {},
                symbols_: {
                    "error": 2,
                    "root": 3,
                    "statements": 4,
                    "EOF": 5,
                    "statement": 6,
                    "references": 7,
                    "directives": 8,
                    "content": 9,
                    "COMMENT": 10,
                    "set": 11,
                    "if": 12,
                    "elseif": 13,
                    "else": 14,
                    "end": 15,
                    "foreach": 16,
                    "break": 17,
                    "define": 18,
                    "HASH": 19,
                    "NOESCAPE": 20,
                    "PARENTHESIS": 21,
                    "CLOSE_PARENTHESIS": 22,
                    "macro": 23,
                    "macro_call": 24,
                    "SET": 25,
                    "equal": 26,
                    "IF": 27,
                    "expression": 28,
                    "ELSEIF": 29,
                    "ELSE": 30,
                    "END": 31,
                    "FOREACH": 32,
                    "DOLLAR": 33,
                    "ID": 34,
                    "IN": 35,
                    "array": 36,
                    "BREAK": 37,
                    "DEFINE": 38,
                    "MACRO": 39,
                    "macro_args": 40,
                    "macro_call_args_all": 41,
                    "macro_call_args": 42,
                    "literals": 43,
                    "SPACE": 44,
                    "COMMA": 45,
                    "EQUAL": 46,
                    "map": 47,
                    "math": 48,
                    "||": 49,
                    "&&": 50,
                    "+": 51,
                    "-": 52,
                    "*": 53,
                    "/": 54,
                    "%": 55,
                    ">": 56,
                    "<": 57,
                    "==": 58,
                    ">=": 59,
                    "<=": 60,
                    "!=": 61,
                    "parenthesis": 62,
                    "!": 63,
                    "literal": 64,
                    "brace_begin": 65,
                    "attributes": 66,
                    "brace_end": 67,
                    "methodbd": 68,
                    "VAR_BEGIN": 69,
                    "MAP_BEGIN": 70,
                    "VAR_END": 71,
                    "MAP_END": 72,
                    "attribute": 73,
                    "method": 74,
                    "index": 75,
                    "property": 76,
                    "DOT": 77,
                    "params": 78,
                    "CONTENT": 79,
                    "BRACKET": 80,
                    "CLOSE_BRACKET": 81,
                    "string": 82,
                    "number": 83,
                    "BOOL": 84,
                    "integer": 85,
                    "INTEGER": 86,
                    "DECIMAL_POINT": 87,
                    "STRING": 88,
                    "EVAL_STRING": 89,
                    "range": 90,
                    "RANGE": 91,
                    "map_item": 92,
                    "MAP_SPLIT": 93,
                    "$accept": 0,
                    "$end": 1
                },
                terminals_: {
                    2: "error",
                    5: "EOF",
                    10: "COMMENT",
                    19: "HASH",
                    20: "NOESCAPE",
                    21: "PARENTHESIS",
                    22: "CLOSE_PARENTHESIS",
                    25: "SET",
                    27: "IF",
                    29: "ELSEIF",
                    30: "ELSE",
                    31: "END",
                    32: "FOREACH",
                    33: "DOLLAR",
                    34: "ID",
                    35: "IN",
                    37: "BREAK",
                    38: "DEFINE",
                    39: "MACRO",
                    44: "SPACE",
                    45: "COMMA",
                    46: "EQUAL",
                    49: "||",
                    50: "&&",
                    51: "+",
                    52: "-",
                    53: "*",
                    54: "/",
                    55: "%",
                    56: ">",
                    57: "<",
                    58: "==",
                    59: ">=",
                    60: "<=",
                    61: "!=",
                    63: "!",
                    69: "VAR_BEGIN",
                    70: "MAP_BEGIN",
                    71: "VAR_END",
                    72: "MAP_END",
                    77: "DOT",
                    79: "CONTENT",
                    80: "BRACKET",
                    81: "CLOSE_BRACKET",
                    84: "BOOL",
                    86: "INTEGER",
                    87: "DECIMAL_POINT",
                    88: "STRING",
                    89: "EVAL_STRING",
                    91: "RANGE",
                    93: "MAP_SPLIT"
                },
                productions_: [0, [3, 2],
                    [4, 1],
                    [4, 2],
                    [6, 1],
                    [6, 1],
                    [6, 1],
                    [6, 1],
                    [8, 1],
                    [8, 1],
                    [8, 1],
                    [8, 1],
                    [8, 1],
                    [8, 1],
                    [8, 1],
                    [8, 1],
                    [8, 4],
                    [8, 1],
                    [8, 1],
                    [11, 5],
                    [12, 5],
                    [13, 5],
                    [14, 2],
                    [15, 2],
                    [16, 8],
                    [16, 8],
                    [17, 2],
                    [18, 6],
                    [23, 6],
                    [23, 5],
                    [40, 1],
                    [40, 2],
                    [24, 5],
                    [24, 4],
                    [42, 1],
                    [42, 1],
                    [42, 3],
                    [42, 3],
                    [42, 3],
                    [42, 3],
                    [41, 1],
                    [41, 2],
                    [41, 3],
                    [41, 2],
                    [26, 3],
                    [28, 1],
                    [28, 1],
                    [28, 1],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 3],
                    [48, 1],
                    [48, 2],
                    [48, 2],
                    [48, 1],
                    [48, 1],
                    [62, 3],
                    [7, 5],
                    [7, 3],
                    [7, 5],
                    [7, 3],
                    [7, 2],
                    [7, 4],
                    [7, 2],
                    [7, 4],
                    [65, 1],
                    [65, 1],
                    [67, 1],
                    [67, 1],
                    [66, 1],
                    [66, 2],
                    [73, 1],
                    [73, 1],
                    [73, 1],
                    [74, 2],
                    [68, 4],
                    [68, 3],
                    [78, 1],
                    [78, 1],
                    [78, 3],
                    [78, 3],
                    [76, 2],
                    [76, 2],
                    [75, 3],
                    [75, 3],
                    [75, 3],
                    [75, 2],
                    [75, 2],
                    [64, 1],
                    [64, 1],
                    [64, 1],
                    [83, 1],
                    [83, 3],
                    [83, 4],
                    [85, 1],
                    [85, 2],
                    [82, 1],
                    [82, 1],
                    [43, 1],
                    [43, 1],
                    [43, 1],
                    [36, 3],
                    [36, 1],
                    [36, 2],
                    [90, 5],
                    [90, 5],
                    [90, 5],
                    [90, 5],
                    [47, 3],
                    [47, 2],
                    [92, 3],
                    [92, 3],
                    [92, 2],
                    [92, 5],
                    [92, 5],
                    [9, 1],
                    [9, 1],
                    [9, 2],
                    [9, 3],
                    [9, 3],
                    [9, 2]
                ],
                performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$) {

                    var $0 = $$.length - 1;
                    switch (yystate) {
                        case 1:
                            return $$[$0 - 1];
                            break;
                        case 2:
                            this.$ = [$$[$0]];
                            break;
                        case 3:
                            this.$ = [].concat($$[$0 - 1], $$[$0]);
                            break;
                        case 4:
                            this.$ = $$[$0];
                            break;
                        case 5:
                            this.$ = $$[$0];
                            break;
                        case 6:
                            this.$ = $$[$0];
                            break;
                        case 7:
                            this.$ = {
                                type: 'comment',
                                value: $$[$0]
                            };
                            break;
                        case 8:
                            this.$ = $$[$0];
                            break;
                        case 9:
                            this.$ = $$[$0];
                            break;
                        case 10:
                            this.$ = $$[$0];
                            break;
                        case 11:
                            this.$ = $$[$0];
                            break;
                        case 12:
                            this.$ = $$[$0];
                            break;
                        case 13:
                            this.$ = $$[$0];
                            break;
                        case 14:
                            this.$ = $$[$0];
                            break;
                        case 15:
                            this.$ = $$[$0];
                            break;
                        case 16:
                            this.$ = {
                                type: 'noescape'
                            };
                            break;
                        case 17:
                            this.$ = $$[$0];
                            break;
                        case 18:
                            this.$ = $$[$0];
                            break;
                        case 19:
                            this.$ = {
                                type: 'set',
                                equal: $$[$0 - 1]
                            };
                            break;
                        case 20:
                            this.$ = {
                                type: 'if',
                                condition: $$[$0 - 1]
                            };
                            break;
                        case 21:
                            this.$ = {
                                type: 'elseif',
                                condition: $$[$0 - 1]
                            };
                            break;
                        case 22:
                            this.$ = {
                                type: 'else'
                            };
                            break;
                        case 23:
                            this.$ = {
                                type: 'end'
                            };
                            break;
                        case 24:
                            this.$ = {
                                type: 'foreach',
                                to: $$[$0 - 3],
                                from: $$[$0 - 1]
                            };
                            break;
                        case 25:
                            this.$ = {
                                type: 'foreach',
                                to: $$[$0 - 3],
                                from: $$[$0 - 1]
                            };
                            break;
                        case 26:
                            this.$ = {
                                type: $$[$0]
                            };
                            break;
                        case 27:
                            this.$ = {
                                type: 'define',
                                id: $$[$0 - 1]
                            };
                            break;
                        case 28:
                            this.$ = {
                                type: 'macro',
                                id: $$[$0 - 2],
                                args: $$[$0 - 1]
                            };
                            break;
                        case 29:
                            this.$ = {
                                type: 'macro',
                                id: $$[$0 - 1]
                            };
                            break;
                        case 30:
                            this.$ = [$$[$0]];
                            break;
                        case 31:
                            this.$ = [].concat($$[$0 - 1], $$[$0]);
                            break;
                        case 32:
                            this.$ = {
                                type: "macro_call",
                                id: $$[$0 - 3].replace(/^\s+|\s+$/g, ''),
                                args: $$[$0 - 1]
                            };
                            break;
                        case 33:
                            this.$ = {
                                type: "macro_call",
                                id: $$[$0 - 2].replace(/^\s+|\s+$/g, '')
                            };
                            break;
                        case 34:
                            this.$ = [$$[$0]];
                            break;
                        case 35:
                            this.$ = [$$[$0]];
                            break;
                        case 36:
                            this.$ = [].concat($$[$0 - 2], $$[$0]);
                            break;
                        case 37:
                            this.$ = [].concat($$[$0 - 2], $$[$0]);
                            break;
                        case 38:
                            this.$ = [].concat($$[$0 - 2], $$[$0]);
                            break;
                        case 39:
                            this.$ = [].concat($$[$0 - 2], $$[$0]);
                            break;
                        case 40:
                            this.$ = $$[$0];
                            break;
                        case 41:
                            this.$ = $$[$0];
                            break;
                        case 42:
                            this.$ = $$[$0 - 1];
                            break;
                        case 43:
                            this.$ = $$[$0 - 1];
                            break;
                        case 44:
                            this.$ = [$$[$0 - 2], $$[$0]];
                            break;
                        case 45:
                            this.$ = $$[$0];
                            break;
                        case 46:
                            this.$ = $$[$0];
                            break;
                        case 47:
                            this.$ = $$[$0];
                            break;
                        case 48:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 49:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 50:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 51:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 52:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 53:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 54:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 55:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 56:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 57:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 58:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 59:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 60:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 2], $$[$0]],
                                operator: $$[$0 - 1]
                            };
                            break;
                        case 61:
                            this.$ = $$[$0];
                            break;
                        case 62:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0]],
                                operator: 'minus'
                            };
                            break;
                        case 63:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0]],
                                operator: 'not'
                            };
                            break;
                        case 64:
                            this.$ = $$[$0];
                            break;
                        case 65:
                            this.$ = $$[$0];
                            break;
                        case 66:
                            this.$ = {
                                type: 'math',
                                expression: [$$[$0 - 1]],
                                operator: 'parenthesis'
                            };
                            break;
                        case 67:
                            this.$ = {
                                type: "references",
                                id: $$[$0 - 2],
                                path: $$[$0 - 1],
                                isWraped: true,
                                leader: $$[$0 - 4]
                            };
                            break;
                        case 68:
                            this.$ = {
                                type: "references",
                                id: $$[$0 - 1],
                                path: $$[$0],
                                leader: $$[$0 - 2]
                            };
                            break;
                        case 69:
                            this.$ = {
                                type: "references",
                                id: $$[$0 - 2].id,
                                path: $$[$0 - 1],
                                isWraped: true,
                                leader: $$[$0 - 4],
                                args: $$[$0 - 2].args
                            };
                            break;
                        case 70:
                            this.$ = {
                                type: "references",
                                id: $$[$0 - 1].id,
                                path: $$[$0],
                                leader: $$[$0 - 2],
                                args: $$[$0 - 1].args
                            };
                            break;
                        case 71:
                            this.$ = {
                                type: "references",
                                id: $$[$0],
                                leader: $$[$0 - 1]
                            };
                            break;
                        case 72:
                            this.$ = {
                                type: "references",
                                id: $$[$0 - 1],
                                isWraped: true,
                                leader: $$[$0 - 3]
                            };
                            break;
                        case 73:
                            this.$ = {
                                type: "references",
                                id: $$[$0].id,
                                leader: $$[$0 - 1],
                                args: $$[$0].args
                            };
                            break;
                        case 74:
                            this.$ = {
                                type: "references",
                                id: $$[$0 - 1].id,
                                isWraped: true,
                                args: $$[$0 - 1].args,
                                leader: $$[$0 - 3]
                            };
                            break;
                        case 75:
                            this.$ = $$[$0];
                            break;
                        case 76:
                            this.$ = $$[$0];
                            break;
                        case 77:
                            this.$ = $$[$0];
                            break;
                        case 78:
                            this.$ = $$[$0];
                            break;
                        case 79:
                            this.$ = [$$[$0]];
                            break;
                        case 80:
                            this.$ = [].concat($$[$0 - 1], $$[$0]);
                            break;
                        case 81:
                            this.$ = {
                                type: "method",
                                id: $$[$0].id,
                                args: $$[$0].args
                            };
                            break;
                        case 82:
                            this.$ = {
                                type: "index",
                                id: $$[$0]
                            };
                            break;
                        case 83:
                            this.$ = {
                                type: "property",
                                id: $$[$0]
                            };
                            if ($$[$0].type === 'content') this.$ = $$[$0];
                            break;
                        case 84:
                            this.$ = $$[$0];
                            break;
                        case 85:
                            this.$ = {
                                id: $$[$0 - 3],
                                args: $$[$0 - 1]
                            };
                            break;
                        case 86:
                            this.$ = {
                                id: $$[$0 - 2],
                                args: false
                            };
                            break;
                        case 87:
                            this.$ = [$$[$0]];
                            break;
                        case 88:
                            this.$ = [$$[$0]];
                            break;
                        case 89:
                            this.$ = [].concat($$[$0 - 2], $$[$0]);
                            break;
                        case 90:
                            this.$ = [].concat($$[$0 - 2], $$[$0]);
                            break;
                        case 91:
                            this.$ = $$[$0];
                            break;
                        case 92:
                            this.$ = {
                                type: 'content',
                                value: $$[$0 - 1] + $$[$0]
                            };
                            break;
                        case 93:
                            this.$ = $$[$0 - 1];
                            break;
                        case 94:
                            this.$ = $$[$0 - 1];
                            break;
                        case 95:
                            this.$ = {
                                type: "content",
                                value: $$[$0 - 2] + $$[$0 - 1].value + $$[$0]
                            };
                            break;
                        case 96:
                            this.$ = {
                                type: "content",
                                value: $$[$0 - 1] + $$[$0]
                            };
                            break;
                        case 97:
                            this.$ = {
                                type: "content",
                                value: $$[$0 - 1] + $$[$0]
                            };
                            break;
                        case 98:
                            this.$ = $$[$0];
                            break;
                        case 99:
                            this.$ = $$[$0];
                            break;
                        case 100:
                            this.$ = {
                                type: 'bool',
                                value: $$[$0]
                            };
                            break;
                        case 101:
                            this.$ = {
                                type: "integer",
                                value: $$[$0]
                            };
                            break;
                        case 102:
                            this.$ = {
                                type: "decimal",
                                value: +($$[$0 - 2] + '.' + $$[$0])
                            };
                            break;
                        case 103:
                            this.$ = {
                                type: "decimal",
                                value: -($$[$0 - 2] + '.' + $$[$0])
                            };
                            break;
                        case 104:
                            this.$ = $$[$0];
                            break;
                        case 105:
                            this.$ = -parseInt($$[$0], 10);
                            break;
                        case 106:
                            this.$ = {
                                type: 'string',
                                value: $$[$0]
                            };
                            break;
                        case 107:
                            this.$ = {
                                type: 'string',
                                value: $$[$0],
                                isEval: true
                            };
                            break;
                        case 108:
                            this.$ = $$[$0];
                            break;
                        case 109:
                            this.$ = $$[$0];
                            break;
                        case 110:
                            this.$ = $$[$0];
                            break;
                        case 111:
                            this.$ = {
                                type: 'array',
                                value: $$[$0 - 1]
                            };
                            break;
                        case 112:
                            this.$ = $$[$0];
                            break;
                        case 113:
                            this.$ = {
                                type: 'array',
                                value: []
                            };
                            break;
                        case 114:
                            this.$ = {
                                type: 'array',
                                isRange: true,
                                value: [$$[$0 - 3], $$[$0 - 1]]
                            };
                            break;
                        case 115:
                            this.$ = {
                                type: 'array',
                                isRange: true,
                                value: [$$[$0 - 3], $$[$0 - 1]]
                            };
                            break;
                        case 116:
                            this.$ = {
                                type: 'array',
                                isRange: true,
                                value: [$$[$0 - 3], $$[$0 - 1]]
                            };
                            break;
                        case 117:
                            this.$ = {
                                type: 'array',
                                isRange: true,
                                value: [$$[$0 - 3], $$[$0 - 1]]
                            };
                            break;
                        case 118:
                            this.$ = {
                                type: 'map',
                                value: $$[$0 - 1]
                            };
                            break;
                        case 119:
                            this.$ = {
                                type: 'map'
                            };
                            break;
                        case 120:
                            this.$ = {};
                            this.$[$$[$0 - 2].value] = $$[$0];
                            break;
                        case 121:
                            this.$ = {};
                            this.$[$$[$0 - 2].value] = $$[$0];
                            break;
                        case 122:
                            this.$ = {};
                            this.$[$$[$0 - 1].value] = $$[$01];
                            break;
                        case 123:
                            this.$ = $$[$0 - 4];
                            this.$[$$[$0 - 2].value] = $$[$0];
                            break;
                        case 124:
                            this.$ = $$[$0 - 4];
                            this.$[$$[$0 - 2].value] = $$[$0];
                            break;
                        case 125:
                            this.$ = $$[$0];
                            break;
                        case 126:
                            this.$ = $$[$0];
                            break;
                        case 127:
                            this.$ = $$[$0 - 1] + $$[$0];
                            break;
                        case 128:
                            this.$ = $$[$0 - 2] + $$[$0 - 1] + $$[$0];
                            break;
                        case 129:
                            this.$ = $$[$0 - 2] + $$[$0 - 1];
                            break;
                        case 130:
                            this.$ = $$[$0 - 1] + $$[$0];
                            break;
                    }
                },
                table: [{
                        3: 1,
                        4: 2,
                        6: 3,
                        7: 4,
                        8: 5,
                        9: 6,
                        10: [1, 7],
                        11: 9,
                        12: 10,
                        13: 11,
                        14: 12,
                        15: 13,
                        16: 14,
                        17: 15,
                        18: 16,
                        19: [1, 17],
                        23: 18,
                        24: 19,
                        33: [1, 8],
                        34: [1, 21],
                        79: [1, 20]
                    }, {
                        1: [3]
                    }, {
                        5: [1, 22],
                        6: 23,
                        7: 4,
                        8: 5,
                        9: 6,
                        10: [1, 7],
                        11: 9,
                        12: 10,
                        13: 11,
                        14: 12,
                        15: 13,
                        16: 14,
                        17: 15,
                        18: 16,
                        19: [1, 17],
                        23: 18,
                        24: 19,
                        33: [1, 8],
                        34: [1, 21],
                        79: [1, 20]
                    }, {
                        5: [2, 2],
                        10: [2, 2],
                        19: [2, 2],
                        33: [2, 2],
                        34: [2, 2],
                        79: [2, 2]
                    }, {
                        5: [2, 4],
                        10: [2, 4],
                        19: [2, 4],
                        33: [2, 4],
                        34: [2, 4],
                        79: [2, 4]
                    }, {
                        5: [2, 5],
                        10: [2, 5],
                        19: [2, 5],
                        33: [2, 5],
                        34: [2, 5],
                        79: [2, 5]
                    }, {
                        5: [2, 6],
                        10: [2, 6],
                        19: [2, 6],
                        33: [2, 6],
                        34: [2, 6],
                        79: [2, 6]
                    }, {
                        5: [2, 7],
                        10: [2, 7],
                        19: [2, 7],
                        33: [2, 7],
                        34: [2, 7],
                        79: [2, 7]
                    }, {
                        34: [1, 25],
                        65: 24,
                        67: 27,
                        68: 26,
                        69: [1, 29],
                        70: [1, 30],
                        71: [1, 31],
                        72: [1, 32],
                        79: [1, 28]
                    }, {
                        5: [2, 8],
                        10: [2, 8],
                        19: [2, 8],
                        33: [2, 8],
                        34: [2, 8],
                        79: [2, 8]
                    }, {
                        5: [2, 9],
                        10: [2, 9],
                        19: [2, 9],
                        33: [2, 9],
                        34: [2, 9],
                        79: [2, 9]
                    }, {
                        5: [2, 10],
                        10: [2, 10],
                        19: [2, 10],
                        33: [2, 10],
                        34: [2, 10],
                        79: [2, 10]
                    }, {
                        5: [2, 11],
                        10: [2, 11],
                        19: [2, 11],
                        33: [2, 11],
                        34: [2, 11],
                        79: [2, 11]
                    }, {
                        5: [2, 12],
                        10: [2, 12],
                        19: [2, 12],
                        33: [2, 12],
                        34: [2, 12],
                        79: [2, 12]
                    }, {
                        5: [2, 13],
                        10: [2, 13],
                        19: [2, 13],
                        33: [2, 13],
                        34: [2, 13],
                        79: [2, 13]
                    }, {
                        5: [2, 14],
                        10: [2, 14],
                        19: [2, 14],
                        33: [2, 14],
                        34: [2, 14],
                        79: [2, 14]
                    }, {
                        5: [2, 15],
                        10: [2, 15],
                        19: [2, 15],
                        33: [2, 15],
                        34: [2, 15],
                        79: [2, 15]
                    }, {
                        20: [1, 33],
                        25: [1, 36],
                        27: [1, 37],
                        29: [1, 38],
                        30: [1, 39],
                        31: [1, 40],
                        32: [1, 41],
                        34: [1, 35],
                        37: [1, 42],
                        38: [1, 43],
                        39: [1, 44],
                        79: [1, 34]
                    }, {
                        5: [2, 17],
                        10: [2, 17],
                        19: [2, 17],
                        33: [2, 17],
                        34: [2, 17],
                        79: [2, 17]
                    }, {
                        5: [2, 18],
                        10: [2, 18],
                        19: [2, 18],
                        33: [2, 18],
                        34: [2, 18],
                        79: [2, 18]
                    }, {
                        5: [2, 125],
                        10: [2, 125],
                        19: [2, 125],
                        33: [2, 125],
                        34: [2, 125],
                        79: [2, 125]
                    }, {
                        5: [2, 126],
                        10: [2, 126],
                        19: [2, 126],
                        33: [2, 126],
                        34: [2, 126],
                        79: [2, 126]
                    }, {
                        1: [2, 1]
                    }, {
                        5: [2, 3],
                        10: [2, 3],
                        19: [2, 3],
                        33: [2, 3],
                        34: [2, 3],
                        79: [2, 3]
                    }, {
                        34: [1, 45],
                        68: 46
                    }, {
                        5: [2, 71],
                        10: [2, 71],
                        19: [2, 71],
                        21: [1, 48],
                        22: [2, 71],
                        33: [2, 71],
                        34: [2, 71],
                        44: [2, 71],
                        45: [2, 71],
                        46: [2, 71],
                        49: [2, 71],
                        50: [2, 71],
                        51: [2, 71],
                        52: [2, 71],
                        53: [2, 71],
                        54: [2, 71],
                        55: [2, 71],
                        56: [2, 71],
                        57: [2, 71],
                        58: [2, 71],
                        59: [2, 71],
                        60: [2, 71],
                        61: [2, 71],
                        66: 47,
                        72: [2, 71],
                        73: 49,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        79: [2, 71],
                        80: [1, 54],
                        81: [2, 71],
                        91: [2, 71]
                    }, {
                        5: [2, 73],
                        10: [2, 73],
                        19: [2, 73],
                        22: [2, 73],
                        33: [2, 73],
                        34: [2, 73],
                        44: [2, 73],
                        45: [2, 73],
                        46: [2, 73],
                        49: [2, 73],
                        50: [2, 73],
                        51: [2, 73],
                        52: [2, 73],
                        53: [2, 73],
                        54: [2, 73],
                        55: [2, 73],
                        56: [2, 73],
                        57: [2, 73],
                        58: [2, 73],
                        59: [2, 73],
                        60: [2, 73],
                        61: [2, 73],
                        66: 55,
                        72: [2, 73],
                        73: 49,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        79: [2, 73],
                        80: [1, 54],
                        81: [2, 73],
                        91: [2, 73]
                    }, {
                        34: [1, 57],
                        68: 56
                    }, {
                        5: [2, 130],
                        10: [2, 130],
                        19: [2, 130],
                        33: [2, 130],
                        34: [2, 130],
                        79: [2, 130]
                    }, {
                        34: [2, 75]
                    }, {
                        34: [2, 76]
                    }, {
                        5: [2, 77],
                        10: [2, 77],
                        19: [2, 77],
                        22: [2, 77],
                        33: [2, 77],
                        34: [2, 77],
                        44: [2, 77],
                        45: [2, 77],
                        46: [2, 77],
                        49: [2, 77],
                        50: [2, 77],
                        51: [2, 77],
                        52: [2, 77],
                        53: [2, 77],
                        54: [2, 77],
                        55: [2, 77],
                        56: [2, 77],
                        57: [2, 77],
                        58: [2, 77],
                        59: [2, 77],
                        60: [2, 77],
                        61: [2, 77],
                        72: [2, 77],
                        79: [2, 77],
                        81: [2, 77],
                        91: [2, 77]
                    }, {
                        5: [2, 78],
                        10: [2, 78],
                        19: [2, 78],
                        22: [2, 78],
                        33: [2, 78],
                        34: [2, 78],
                        44: [2, 78],
                        45: [2, 78],
                        46: [2, 78],
                        49: [2, 78],
                        50: [2, 78],
                        51: [2, 78],
                        52: [2, 78],
                        53: [2, 78],
                        54: [2, 78],
                        55: [2, 78],
                        56: [2, 78],
                        57: [2, 78],
                        58: [2, 78],
                        59: [2, 78],
                        60: [2, 78],
                        61: [2, 78],
                        72: [2, 78],
                        79: [2, 78],
                        81: [2, 78],
                        91: [2, 78]
                    }, {
                        21: [1, 58]
                    }, {
                        5: [2, 127],
                        10: [2, 127],
                        19: [2, 127],
                        33: [2, 127],
                        34: [2, 127],
                        79: [2, 127]
                    }, {
                        5: [1, 60],
                        21: [1, 61],
                        79: [1, 59]
                    }, {
                        21: [1, 62]
                    }, {
                        21: [1, 63]
                    }, {
                        21: [1, 64]
                    }, {
                        5: [2, 22],
                        10: [2, 22],
                        19: [2, 22],
                        33: [2, 22],
                        34: [2, 22],
                        79: [2, 22]
                    }, {
                        5: [2, 23],
                        10: [2, 23],
                        19: [2, 23],
                        33: [2, 23],
                        34: [2, 23],
                        79: [2, 23]
                    }, {
                        21: [1, 65]
                    }, {
                        5: [2, 26],
                        10: [2, 26],
                        19: [2, 26],
                        33: [2, 26],
                        34: [2, 26],
                        79: [2, 26]
                    }, {
                        21: [1, 66]
                    }, {
                        21: [1, 67]
                    }, {
                        21: [1, 48],
                        66: 68,
                        67: 69,
                        71: [1, 31],
                        72: [1, 32],
                        73: 49,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        80: [1, 54]
                    }, {
                        66: 70,
                        73: 49,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        80: [1, 54]
                    }, {
                        5: [2, 68],
                        10: [2, 68],
                        19: [2, 68],
                        22: [2, 68],
                        33: [2, 68],
                        34: [2, 68],
                        44: [2, 68],
                        45: [2, 68],
                        46: [2, 68],
                        49: [2, 68],
                        50: [2, 68],
                        51: [2, 68],
                        52: [2, 68],
                        53: [2, 68],
                        54: [2, 68],
                        55: [2, 68],
                        56: [2, 68],
                        57: [2, 68],
                        58: [2, 68],
                        59: [2, 68],
                        60: [2, 68],
                        61: [2, 68],
                        72: [2, 68],
                        73: 71,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        79: [2, 68],
                        80: [1, 54],
                        81: [2, 68],
                        91: [2, 68]
                    }, {
                        7: 75,
                        22: [1, 73],
                        33: [1, 79],
                        36: 76,
                        43: 74,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        78: 72,
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        5: [2, 79],
                        10: [2, 79],
                        19: [2, 79],
                        22: [2, 79],
                        33: [2, 79],
                        34: [2, 79],
                        44: [2, 79],
                        45: [2, 79],
                        46: [2, 79],
                        49: [2, 79],
                        50: [2, 79],
                        51: [2, 79],
                        52: [2, 79],
                        53: [2, 79],
                        54: [2, 79],
                        55: [2, 79],
                        56: [2, 79],
                        57: [2, 79],
                        58: [2, 79],
                        59: [2, 79],
                        60: [2, 79],
                        61: [2, 79],
                        71: [2, 79],
                        72: [2, 79],
                        77: [2, 79],
                        79: [2, 79],
                        80: [2, 79],
                        81: [2, 79],
                        91: [2, 79]
                    }, {
                        5: [2, 81],
                        10: [2, 81],
                        19: [2, 81],
                        22: [2, 81],
                        33: [2, 81],
                        34: [2, 81],
                        44: [2, 81],
                        45: [2, 81],
                        46: [2, 81],
                        49: [2, 81],
                        50: [2, 81],
                        51: [2, 81],
                        52: [2, 81],
                        53: [2, 81],
                        54: [2, 81],
                        55: [2, 81],
                        56: [2, 81],
                        57: [2, 81],
                        58: [2, 81],
                        59: [2, 81],
                        60: [2, 81],
                        61: [2, 81],
                        71: [2, 81],
                        72: [2, 81],
                        77: [2, 81],
                        79: [2, 81],
                        80: [2, 81],
                        81: [2, 81],
                        91: [2, 81]
                    }, {
                        5: [2, 82],
                        10: [2, 82],
                        19: [2, 82],
                        22: [2, 82],
                        33: [2, 82],
                        34: [2, 82],
                        44: [2, 82],
                        45: [2, 82],
                        46: [2, 82],
                        49: [2, 82],
                        50: [2, 82],
                        51: [2, 82],
                        52: [2, 82],
                        53: [2, 82],
                        54: [2, 82],
                        55: [2, 82],
                        56: [2, 82],
                        57: [2, 82],
                        58: [2, 82],
                        59: [2, 82],
                        60: [2, 82],
                        61: [2, 82],
                        71: [2, 82],
                        72: [2, 82],
                        77: [2, 82],
                        79: [2, 82],
                        80: [2, 82],
                        81: [2, 82],
                        91: [2, 82]
                    }, {
                        5: [2, 83],
                        10: [2, 83],
                        19: [2, 83],
                        22: [2, 83],
                        33: [2, 83],
                        34: [2, 83],
                        44: [2, 83],
                        45: [2, 83],
                        46: [2, 83],
                        49: [2, 83],
                        50: [2, 83],
                        51: [2, 83],
                        52: [2, 83],
                        53: [2, 83],
                        54: [2, 83],
                        55: [2, 83],
                        56: [2, 83],
                        57: [2, 83],
                        58: [2, 83],
                        59: [2, 83],
                        60: [2, 83],
                        61: [2, 83],
                        71: [2, 83],
                        72: [2, 83],
                        77: [2, 83],
                        79: [2, 83],
                        80: [2, 83],
                        81: [2, 83],
                        91: [2, 83]
                    }, {
                        34: [1, 92],
                        68: 91,
                        79: [1, 93]
                    }, {
                        7: 95,
                        33: [1, 79],
                        52: [1, 90],
                        64: 94,
                        79: [1, 96],
                        81: [1, 97],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        5: [2, 70],
                        10: [2, 70],
                        19: [2, 70],
                        22: [2, 70],
                        33: [2, 70],
                        34: [2, 70],
                        44: [2, 70],
                        45: [2, 70],
                        46: [2, 70],
                        49: [2, 70],
                        50: [2, 70],
                        51: [2, 70],
                        52: [2, 70],
                        53: [2, 70],
                        54: [2, 70],
                        55: [2, 70],
                        56: [2, 70],
                        57: [2, 70],
                        58: [2, 70],
                        59: [2, 70],
                        60: [2, 70],
                        61: [2, 70],
                        72: [2, 70],
                        73: 71,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        79: [2, 70],
                        80: [1, 54],
                        81: [2, 70],
                        91: [2, 70]
                    }, {
                        67: 98,
                        71: [1, 31],
                        72: [1, 32]
                    }, {
                        21: [1, 48]
                    }, {
                        22: [1, 99]
                    }, {
                        5: [2, 128],
                        10: [2, 128],
                        19: [2, 128],
                        33: [2, 128],
                        34: [2, 128],
                        79: [2, 128]
                    }, {
                        5: [2, 129],
                        10: [2, 129],
                        19: [2, 129],
                        33: [2, 129],
                        34: [2, 129],
                        79: [2, 129]
                    }, {
                        7: 105,
                        22: [1, 101],
                        33: [1, 79],
                        36: 76,
                        41: 100,
                        42: 102,
                        43: 104,
                        44: [1, 103],
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        7: 107,
                        26: 106,
                        33: [1, 79]
                    }, {
                        7: 115,
                        21: [1, 117],
                        28: 108,
                        33: [1, 79],
                        36: 109,
                        47: 110,
                        48: 111,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        7: 115,
                        21: [1, 117],
                        28: 118,
                        33: [1, 79],
                        36: 109,
                        47: 110,
                        48: 111,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        33: [1, 119]
                    }, {
                        33: [1, 120]
                    }, {
                        34: [1, 121]
                    }, {
                        67: 122,
                        71: [1, 31],
                        72: [1, 32],
                        73: 71,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        80: [1, 54]
                    }, {
                        5: [2, 72],
                        10: [2, 72],
                        19: [2, 72],
                        22: [2, 72],
                        33: [2, 72],
                        34: [2, 72],
                        44: [2, 72],
                        45: [2, 72],
                        46: [2, 72],
                        49: [2, 72],
                        50: [2, 72],
                        51: [2, 72],
                        52: [2, 72],
                        53: [2, 72],
                        54: [2, 72],
                        55: [2, 72],
                        56: [2, 72],
                        57: [2, 72],
                        58: [2, 72],
                        59: [2, 72],
                        60: [2, 72],
                        61: [2, 72],
                        72: [2, 72],
                        79: [2, 72],
                        81: [2, 72],
                        91: [2, 72]
                    }, {
                        67: 123,
                        71: [1, 31],
                        72: [1, 32],
                        73: 71,
                        74: 50,
                        75: 51,
                        76: 52,
                        77: [1, 53],
                        80: [1, 54]
                    }, {
                        5: [2, 80],
                        10: [2, 80],
                        19: [2, 80],
                        22: [2, 80],
                        33: [2, 80],
                        34: [2, 80],
                        44: [2, 80],
                        45: [2, 80],
                        46: [2, 80],
                        49: [2, 80],
                        50: [2, 80],
                        51: [2, 80],
                        52: [2, 80],
                        53: [2, 80],
                        54: [2, 80],
                        55: [2, 80],
                        56: [2, 80],
                        57: [2, 80],
                        58: [2, 80],
                        59: [2, 80],
                        60: [2, 80],
                        61: [2, 80],
                        71: [2, 80],
                        72: [2, 80],
                        77: [2, 80],
                        79: [2, 80],
                        80: [2, 80],
                        81: [2, 80],
                        91: [2, 80]
                    }, {
                        22: [1, 124],
                        45: [1, 125]
                    }, {
                        5: [2, 86],
                        10: [2, 86],
                        19: [2, 86],
                        22: [2, 86],
                        33: [2, 86],
                        34: [2, 86],
                        44: [2, 86],
                        45: [2, 86],
                        46: [2, 86],
                        49: [2, 86],
                        50: [2, 86],
                        51: [2, 86],
                        52: [2, 86],
                        53: [2, 86],
                        54: [2, 86],
                        55: [2, 86],
                        56: [2, 86],
                        57: [2, 86],
                        58: [2, 86],
                        59: [2, 86],
                        60: [2, 86],
                        61: [2, 86],
                        71: [2, 86],
                        72: [2, 86],
                        77: [2, 86],
                        79: [2, 86],
                        80: [2, 86],
                        81: [2, 86],
                        91: [2, 86]
                    }, {
                        22: [2, 87],
                        45: [2, 87],
                        81: [2, 87]
                    }, {
                        22: [2, 88],
                        45: [2, 88]
                    }, {
                        22: [2, 108],
                        44: [2, 108],
                        45: [2, 108],
                        72: [2, 108],
                        81: [2, 108]
                    }, {
                        22: [2, 109],
                        44: [2, 109],
                        45: [2, 109],
                        72: [2, 109],
                        81: [2, 109]
                    }, {
                        22: [2, 110],
                        44: [2, 110],
                        45: [2, 110],
                        72: [2, 110],
                        81: [2, 110]
                    }, {
                        34: [1, 25],
                        65: 24,
                        67: 27,
                        68: 26,
                        69: [1, 29],
                        70: [1, 30],
                        71: [1, 31],
                        72: [1, 32]
                    }, {
                        7: 129,
                        33: [1, 79],
                        36: 76,
                        43: 74,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        78: 126,
                        80: [1, 80],
                        81: [1, 127],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 128,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        22: [2, 112],
                        44: [2, 112],
                        45: [2, 112],
                        72: [2, 112],
                        81: [2, 112]
                    }, {
                        72: [1, 131],
                        82: 132,
                        88: [1, 86],
                        89: [1, 87],
                        92: 130
                    }, {
                        22: [2, 98],
                        44: [2, 98],
                        45: [2, 98],
                        49: [2, 98],
                        50: [2, 98],
                        51: [2, 98],
                        52: [2, 98],
                        53: [2, 98],
                        54: [2, 98],
                        55: [2, 98],
                        56: [2, 98],
                        57: [2, 98],
                        58: [2, 98],
                        59: [2, 98],
                        60: [2, 98],
                        61: [2, 98],
                        72: [2, 98],
                        79: [2, 98],
                        81: [2, 98]
                    }, {
                        22: [2, 99],
                        44: [2, 99],
                        45: [2, 99],
                        49: [2, 99],
                        50: [2, 99],
                        51: [2, 99],
                        52: [2, 99],
                        53: [2, 99],
                        54: [2, 99],
                        55: [2, 99],
                        56: [2, 99],
                        57: [2, 99],
                        58: [2, 99],
                        59: [2, 99],
                        60: [2, 99],
                        61: [2, 99],
                        72: [2, 99],
                        79: [2, 99],
                        81: [2, 99]
                    }, {
                        22: [2, 100],
                        44: [2, 100],
                        45: [2, 100],
                        49: [2, 100],
                        50: [2, 100],
                        51: [2, 100],
                        52: [2, 100],
                        53: [2, 100],
                        54: [2, 100],
                        55: [2, 100],
                        56: [2, 100],
                        57: [2, 100],
                        58: [2, 100],
                        59: [2, 100],
                        60: [2, 100],
                        61: [2, 100],
                        72: [2, 100],
                        79: [2, 100],
                        81: [2, 100]
                    }, {
                        22: [2, 106],
                        44: [2, 106],
                        45: [2, 106],
                        49: [2, 106],
                        50: [2, 106],
                        51: [2, 106],
                        52: [2, 106],
                        53: [2, 106],
                        54: [2, 106],
                        55: [2, 106],
                        56: [2, 106],
                        57: [2, 106],
                        58: [2, 106],
                        59: [2, 106],
                        60: [2, 106],
                        61: [2, 106],
                        72: [2, 106],
                        79: [2, 106],
                        81: [2, 106],
                        93: [2, 106]
                    }, {
                        22: [2, 107],
                        44: [2, 107],
                        45: [2, 107],
                        49: [2, 107],
                        50: [2, 107],
                        51: [2, 107],
                        52: [2, 107],
                        53: [2, 107],
                        54: [2, 107],
                        55: [2, 107],
                        56: [2, 107],
                        57: [2, 107],
                        58: [2, 107],
                        59: [2, 107],
                        60: [2, 107],
                        61: [2, 107],
                        72: [2, 107],
                        79: [2, 107],
                        81: [2, 107],
                        93: [2, 107]
                    }, {
                        22: [2, 101],
                        44: [2, 101],
                        45: [2, 101],
                        49: [2, 101],
                        50: [2, 101],
                        51: [2, 101],
                        52: [2, 101],
                        53: [2, 101],
                        54: [2, 101],
                        55: [2, 101],
                        56: [2, 101],
                        57: [2, 101],
                        58: [2, 101],
                        59: [2, 101],
                        60: [2, 101],
                        61: [2, 101],
                        72: [2, 101],
                        79: [2, 101],
                        81: [2, 101]
                    }, {
                        22: [2, 104],
                        44: [2, 104],
                        45: [2, 104],
                        49: [2, 104],
                        50: [2, 104],
                        51: [2, 104],
                        52: [2, 104],
                        53: [2, 104],
                        54: [2, 104],
                        55: [2, 104],
                        56: [2, 104],
                        57: [2, 104],
                        58: [2, 104],
                        59: [2, 104],
                        60: [2, 104],
                        61: [2, 104],
                        72: [2, 104],
                        79: [2, 104],
                        81: [2, 104],
                        87: [1, 133],
                        91: [2, 104]
                    }, {
                        86: [1, 134]
                    }, {
                        5: [2, 84],
                        10: [2, 84],
                        19: [2, 84],
                        22: [2, 84],
                        33: [2, 84],
                        34: [2, 84],
                        44: [2, 84],
                        45: [2, 84],
                        46: [2, 84],
                        49: [2, 84],
                        50: [2, 84],
                        51: [2, 84],
                        52: [2, 84],
                        53: [2, 84],
                        54: [2, 84],
                        55: [2, 84],
                        56: [2, 84],
                        57: [2, 84],
                        58: [2, 84],
                        59: [2, 84],
                        60: [2, 84],
                        61: [2, 84],
                        71: [2, 84],
                        72: [2, 84],
                        77: [2, 84],
                        79: [2, 84],
                        80: [2, 84],
                        81: [2, 84],
                        91: [2, 84]
                    }, {
                        5: [2, 91],
                        10: [2, 91],
                        19: [2, 91],
                        21: [1, 48],
                        22: [2, 91],
                        33: [2, 91],
                        34: [2, 91],
                        44: [2, 91],
                        45: [2, 91],
                        46: [2, 91],
                        49: [2, 91],
                        50: [2, 91],
                        51: [2, 91],
                        52: [2, 91],
                        53: [2, 91],
                        54: [2, 91],
                        55: [2, 91],
                        56: [2, 91],
                        57: [2, 91],
                        58: [2, 91],
                        59: [2, 91],
                        60: [2, 91],
                        61: [2, 91],
                        71: [2, 91],
                        72: [2, 91],
                        77: [2, 91],
                        79: [2, 91],
                        80: [2, 91],
                        81: [2, 91],
                        91: [2, 91]
                    }, {
                        5: [2, 92],
                        10: [2, 92],
                        19: [2, 92],
                        22: [2, 92],
                        33: [2, 92],
                        34: [2, 92],
                        44: [2, 92],
                        45: [2, 92],
                        46: [2, 92],
                        49: [2, 92],
                        50: [2, 92],
                        51: [2, 92],
                        52: [2, 92],
                        53: [2, 92],
                        54: [2, 92],
                        55: [2, 92],
                        56: [2, 92],
                        57: [2, 92],
                        58: [2, 92],
                        59: [2, 92],
                        60: [2, 92],
                        61: [2, 92],
                        71: [2, 92],
                        72: [2, 92],
                        77: [2, 92],
                        79: [2, 92],
                        80: [2, 92],
                        81: [2, 92],
                        91: [2, 92]
                    }, {
                        79: [1, 136],
                        81: [1, 135]
                    }, {
                        81: [1, 137]
                    }, {
                        5: [2, 96],
                        10: [2, 96],
                        19: [2, 96],
                        22: [2, 96],
                        33: [2, 96],
                        34: [2, 96],
                        44: [2, 96],
                        45: [2, 96],
                        46: [2, 96],
                        49: [2, 96],
                        50: [2, 96],
                        51: [2, 96],
                        52: [2, 96],
                        53: [2, 96],
                        54: [2, 96],
                        55: [2, 96],
                        56: [2, 96],
                        57: [2, 96],
                        58: [2, 96],
                        59: [2, 96],
                        60: [2, 96],
                        61: [2, 96],
                        71: [2, 96],
                        72: [2, 96],
                        77: [2, 96],
                        79: [2, 96],
                        80: [2, 96],
                        81: [2, 96],
                        91: [2, 96]
                    }, {
                        5: [2, 97],
                        10: [2, 97],
                        19: [2, 97],
                        22: [2, 97],
                        33: [2, 97],
                        34: [2, 97],
                        44: [2, 97],
                        45: [2, 97],
                        46: [2, 97],
                        49: [2, 97],
                        50: [2, 97],
                        51: [2, 97],
                        52: [2, 97],
                        53: [2, 97],
                        54: [2, 97],
                        55: [2, 97],
                        56: [2, 97],
                        57: [2, 97],
                        58: [2, 97],
                        59: [2, 97],
                        60: [2, 97],
                        61: [2, 97],
                        71: [2, 97],
                        72: [2, 97],
                        77: [2, 97],
                        79: [2, 97],
                        80: [2, 97],
                        81: [2, 97],
                        91: [2, 97]
                    }, {
                        5: [2, 74],
                        10: [2, 74],
                        19: [2, 74],
                        22: [2, 74],
                        33: [2, 74],
                        34: [2, 74],
                        44: [2, 74],
                        45: [2, 74],
                        46: [2, 74],
                        49: [2, 74],
                        50: [2, 74],
                        51: [2, 74],
                        52: [2, 74],
                        53: [2, 74],
                        54: [2, 74],
                        55: [2, 74],
                        56: [2, 74],
                        57: [2, 74],
                        58: [2, 74],
                        59: [2, 74],
                        60: [2, 74],
                        61: [2, 74],
                        72: [2, 74],
                        79: [2, 74],
                        81: [2, 74],
                        91: [2, 74]
                    }, {
                        5: [2, 16],
                        10: [2, 16],
                        19: [2, 16],
                        33: [2, 16],
                        34: [2, 16],
                        79: [2, 16]
                    }, {
                        22: [1, 138]
                    }, {
                        5: [2, 33],
                        10: [2, 33],
                        19: [2, 33],
                        33: [2, 33],
                        34: [2, 33],
                        79: [2, 33]
                    }, {
                        22: [2, 40],
                        44: [1, 139],
                        45: [1, 140]
                    }, {
                        7: 105,
                        33: [1, 79],
                        36: 76,
                        42: 141,
                        43: 104,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        22: [2, 34],
                        44: [2, 34],
                        45: [2, 34]
                    }, {
                        22: [2, 35],
                        44: [2, 35],
                        45: [2, 35]
                    }, {
                        22: [1, 142]
                    }, {
                        46: [1, 143]
                    }, {
                        22: [1, 144]
                    }, {
                        22: [2, 45]
                    }, {
                        22: [2, 46]
                    }, {
                        22: [2, 47],
                        49: [1, 145],
                        50: [1, 146],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [1, 152],
                        57: [1, 153],
                        58: [1, 154],
                        59: [1, 155],
                        60: [1, 156],
                        61: [1, 157]
                    }, {
                        22: [2, 61],
                        49: [2, 61],
                        50: [2, 61],
                        51: [2, 61],
                        52: [2, 61],
                        53: [2, 61],
                        54: [2, 61],
                        55: [2, 61],
                        56: [2, 61],
                        57: [2, 61],
                        58: [2, 61],
                        59: [2, 61],
                        60: [2, 61],
                        61: [2, 61]
                    }, {
                        21: [1, 117],
                        62: 158,
                        86: [1, 134]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 159,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        22: [2, 64],
                        49: [2, 64],
                        50: [2, 64],
                        51: [2, 64],
                        52: [2, 64],
                        53: [2, 64],
                        54: [2, 64],
                        55: [2, 64],
                        56: [2, 64],
                        57: [2, 64],
                        58: [2, 64],
                        59: [2, 64],
                        60: [2, 64],
                        61: [2, 64]
                    }, {
                        22: [2, 65],
                        49: [2, 65],
                        50: [2, 65],
                        51: [2, 65],
                        52: [2, 65],
                        53: [2, 65],
                        54: [2, 65],
                        55: [2, 65],
                        56: [2, 65],
                        57: [2, 65],
                        58: [2, 65],
                        59: [2, 65],
                        60: [2, 65],
                        61: [2, 65]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 160,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        22: [1, 161]
                    }, {
                        34: [1, 162]
                    }, {
                        34: [1, 163]
                    }, {
                        7: 166,
                        22: [1, 165],
                        33: [1, 79],
                        40: 164
                    }, {
                        5: [2, 67],
                        10: [2, 67],
                        19: [2, 67],
                        22: [2, 67],
                        33: [2, 67],
                        34: [2, 67],
                        44: [2, 67],
                        45: [2, 67],
                        46: [2, 67],
                        49: [2, 67],
                        50: [2, 67],
                        51: [2, 67],
                        52: [2, 67],
                        53: [2, 67],
                        54: [2, 67],
                        55: [2, 67],
                        56: [2, 67],
                        57: [2, 67],
                        58: [2, 67],
                        59: [2, 67],
                        60: [2, 67],
                        61: [2, 67],
                        72: [2, 67],
                        79: [2, 67],
                        81: [2, 67],
                        91: [2, 67]
                    }, {
                        5: [2, 69],
                        10: [2, 69],
                        19: [2, 69],
                        22: [2, 69],
                        33: [2, 69],
                        34: [2, 69],
                        44: [2, 69],
                        45: [2, 69],
                        46: [2, 69],
                        49: [2, 69],
                        50: [2, 69],
                        51: [2, 69],
                        52: [2, 69],
                        53: [2, 69],
                        54: [2, 69],
                        55: [2, 69],
                        56: [2, 69],
                        57: [2, 69],
                        58: [2, 69],
                        59: [2, 69],
                        60: [2, 69],
                        61: [2, 69],
                        72: [2, 69],
                        79: [2, 69],
                        81: [2, 69],
                        91: [2, 69]
                    }, {
                        5: [2, 85],
                        10: [2, 85],
                        19: [2, 85],
                        22: [2, 85],
                        33: [2, 85],
                        34: [2, 85],
                        44: [2, 85],
                        45: [2, 85],
                        46: [2, 85],
                        49: [2, 85],
                        50: [2, 85],
                        51: [2, 85],
                        52: [2, 85],
                        53: [2, 85],
                        54: [2, 85],
                        55: [2, 85],
                        56: [2, 85],
                        57: [2, 85],
                        58: [2, 85],
                        59: [2, 85],
                        60: [2, 85],
                        61: [2, 85],
                        71: [2, 85],
                        72: [2, 85],
                        77: [2, 85],
                        79: [2, 85],
                        80: [2, 85],
                        81: [2, 85],
                        91: [2, 85]
                    }, {
                        7: 168,
                        33: [1, 79],
                        36: 76,
                        43: 167,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        45: [1, 125],
                        81: [1, 169]
                    }, {
                        22: [2, 113],
                        44: [2, 113],
                        45: [2, 113],
                        72: [2, 113],
                        81: [2, 113]
                    }, {
                        45: [2, 101],
                        81: [2, 101],
                        91: [1, 170]
                    }, {
                        45: [2, 88],
                        81: [2, 88],
                        91: [1, 171]
                    }, {
                        45: [1, 173],
                        72: [1, 172]
                    }, {
                        22: [2, 119],
                        44: [2, 119],
                        45: [2, 119],
                        72: [2, 119],
                        81: [2, 119]
                    }, {
                        93: [1, 174]
                    }, {
                        86: [1, 175]
                    }, {
                        22: [2, 105],
                        44: [2, 105],
                        45: [2, 105],
                        49: [2, 105],
                        50: [2, 105],
                        51: [2, 105],
                        52: [2, 105],
                        53: [2, 105],
                        54: [2, 105],
                        55: [2, 105],
                        56: [2, 105],
                        57: [2, 105],
                        58: [2, 105],
                        59: [2, 105],
                        60: [2, 105],
                        61: [2, 105],
                        72: [2, 105],
                        79: [2, 105],
                        81: [2, 105],
                        87: [1, 176],
                        91: [2, 105]
                    }, {
                        5: [2, 93],
                        10: [2, 93],
                        19: [2, 93],
                        22: [2, 93],
                        33: [2, 93],
                        34: [2, 93],
                        44: [2, 93],
                        45: [2, 93],
                        46: [2, 93],
                        49: [2, 93],
                        50: [2, 93],
                        51: [2, 93],
                        52: [2, 93],
                        53: [2, 93],
                        54: [2, 93],
                        55: [2, 93],
                        56: [2, 93],
                        57: [2, 93],
                        58: [2, 93],
                        59: [2, 93],
                        60: [2, 93],
                        61: [2, 93],
                        71: [2, 93],
                        72: [2, 93],
                        77: [2, 93],
                        79: [2, 93],
                        80: [2, 93],
                        81: [2, 93],
                        91: [2, 93]
                    }, {
                        5: [2, 95],
                        10: [2, 95],
                        19: [2, 95],
                        22: [2, 95],
                        33: [2, 95],
                        34: [2, 95],
                        44: [2, 95],
                        45: [2, 95],
                        46: [2, 95],
                        49: [2, 95],
                        50: [2, 95],
                        51: [2, 95],
                        52: [2, 95],
                        53: [2, 95],
                        54: [2, 95],
                        55: [2, 95],
                        56: [2, 95],
                        57: [2, 95],
                        58: [2, 95],
                        59: [2, 95],
                        60: [2, 95],
                        61: [2, 95],
                        71: [2, 95],
                        72: [2, 95],
                        77: [2, 95],
                        79: [2, 95],
                        80: [2, 95],
                        81: [2, 95],
                        91: [2, 95]
                    }, {
                        5: [2, 94],
                        10: [2, 94],
                        19: [2, 94],
                        22: [2, 94],
                        33: [2, 94],
                        34: [2, 94],
                        44: [2, 94],
                        45: [2, 94],
                        46: [2, 94],
                        49: [2, 94],
                        50: [2, 94],
                        51: [2, 94],
                        52: [2, 94],
                        53: [2, 94],
                        54: [2, 94],
                        55: [2, 94],
                        56: [2, 94],
                        57: [2, 94],
                        58: [2, 94],
                        59: [2, 94],
                        60: [2, 94],
                        61: [2, 94],
                        71: [2, 94],
                        72: [2, 94],
                        77: [2, 94],
                        79: [2, 94],
                        80: [2, 94],
                        81: [2, 94],
                        91: [2, 94]
                    }, {
                        5: [2, 32],
                        10: [2, 32],
                        19: [2, 32],
                        33: [2, 32],
                        34: [2, 32],
                        79: [2, 32]
                    }, {
                        7: 178,
                        22: [2, 43],
                        33: [1, 79],
                        36: 76,
                        43: 177,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        7: 180,
                        33: [1, 79],
                        36: 76,
                        43: 179,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        22: [2, 41],
                        44: [1, 181],
                        45: [1, 140]
                    }, {
                        5: [2, 19],
                        10: [2, 19],
                        19: [2, 19],
                        33: [2, 19],
                        34: [2, 19],
                        79: [2, 19]
                    }, {
                        7: 115,
                        21: [1, 117],
                        28: 182,
                        33: [1, 79],
                        36: 109,
                        47: 110,
                        48: 111,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        5: [2, 20],
                        10: [2, 20],
                        19: [2, 20],
                        33: [2, 20],
                        34: [2, 20],
                        79: [2, 20]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 183,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 184,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 185,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 186,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 187,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 188,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 189,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 190,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 191,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 192,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 193,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 194,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 115,
                        21: [1, 117],
                        33: [1, 79],
                        48: 195,
                        52: [1, 113],
                        62: 112,
                        63: [1, 114],
                        64: 116,
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        22: [2, 62],
                        49: [2, 62],
                        50: [2, 62],
                        51: [2, 62],
                        52: [2, 62],
                        53: [2, 62],
                        54: [2, 62],
                        55: [2, 62],
                        56: [2, 62],
                        57: [2, 62],
                        58: [2, 62],
                        59: [2, 62],
                        60: [2, 62],
                        61: [2, 62]
                    }, {
                        22: [2, 63],
                        49: [2, 63],
                        50: [2, 63],
                        51: [2, 63],
                        52: [2, 63],
                        53: [2, 63],
                        54: [2, 63],
                        55: [2, 63],
                        56: [2, 63],
                        57: [2, 63],
                        58: [2, 63],
                        59: [2, 63],
                        60: [2, 63],
                        61: [2, 63]
                    }, {
                        22: [1, 196],
                        49: [1, 145],
                        50: [1, 146],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [1, 152],
                        57: [1, 153],
                        58: [1, 154],
                        59: [1, 155],
                        60: [1, 156],
                        61: [1, 157]
                    }, {
                        5: [2, 21],
                        10: [2, 21],
                        19: [2, 21],
                        33: [2, 21],
                        34: [2, 21],
                        79: [2, 21]
                    }, {
                        35: [1, 197]
                    }, {
                        22: [1, 198]
                    }, {
                        7: 200,
                        22: [1, 199],
                        33: [1, 79]
                    }, {
                        5: [2, 29],
                        10: [2, 29],
                        19: [2, 29],
                        33: [2, 29],
                        34: [2, 29],
                        79: [2, 29]
                    }, {
                        22: [2, 30],
                        33: [2, 30]
                    }, {
                        22: [2, 89],
                        45: [2, 89],
                        81: [2, 89]
                    }, {
                        22: [2, 90],
                        45: [2, 90],
                        81: [2, 90]
                    }, {
                        22: [2, 111],
                        44: [2, 111],
                        45: [2, 111],
                        72: [2, 111],
                        81: [2, 111]
                    }, {
                        7: 202,
                        33: [1, 79],
                        52: [1, 204],
                        85: 201,
                        86: [1, 203]
                    }, {
                        7: 206,
                        33: [1, 79],
                        52: [1, 204],
                        85: 205,
                        86: [1, 203]
                    }, {
                        22: [2, 118],
                        44: [2, 118],
                        45: [2, 118],
                        72: [2, 118],
                        81: [2, 118]
                    }, {
                        82: 207,
                        88: [1, 86],
                        89: [1, 87]
                    }, {
                        7: 209,
                        33: [1, 79],
                        36: 76,
                        43: 208,
                        45: [2, 122],
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        72: [2, 122],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        22: [2, 102],
                        44: [2, 102],
                        45: [2, 102],
                        49: [2, 102],
                        50: [2, 102],
                        51: [2, 102],
                        52: [2, 102],
                        53: [2, 102],
                        54: [2, 102],
                        55: [2, 102],
                        56: [2, 102],
                        57: [2, 102],
                        58: [2, 102],
                        59: [2, 102],
                        60: [2, 102],
                        61: [2, 102],
                        72: [2, 102],
                        79: [2, 102],
                        81: [2, 102]
                    }, {
                        86: [1, 210]
                    }, {
                        22: [2, 36],
                        44: [2, 36],
                        45: [2, 36]
                    }, {
                        22: [2, 39],
                        44: [2, 39],
                        45: [2, 39]
                    }, {
                        22: [2, 37],
                        44: [2, 37],
                        45: [2, 37]
                    }, {
                        22: [2, 38],
                        44: [2, 38],
                        45: [2, 38]
                    }, {
                        7: 178,
                        22: [2, 42],
                        33: [1, 79],
                        36: 76,
                        43: 177,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        22: [2, 44]
                    }, {
                        22: [2, 48],
                        49: [2, 48],
                        50: [2, 48],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [1, 152],
                        57: [1, 153],
                        58: [1, 154],
                        59: [1, 155],
                        60: [1, 156],
                        61: [1, 157]
                    }, {
                        22: [2, 49],
                        49: [2, 49],
                        50: [2, 49],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [1, 152],
                        57: [1, 153],
                        58: [1, 154],
                        59: [1, 155],
                        60: [1, 156],
                        61: [1, 157]
                    }, {
                        22: [2, 50],
                        49: [2, 50],
                        50: [2, 50],
                        51: [2, 50],
                        52: [2, 50],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 50],
                        57: [2, 50],
                        58: [2, 50],
                        59: [2, 50],
                        60: [2, 50],
                        61: [2, 50]
                    }, {
                        22: [2, 51],
                        49: [2, 51],
                        50: [2, 51],
                        51: [2, 51],
                        52: [2, 51],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 51],
                        57: [2, 51],
                        58: [2, 51],
                        59: [2, 51],
                        60: [2, 51],
                        61: [2, 51]
                    }, {
                        22: [2, 52],
                        49: [2, 52],
                        50: [2, 52],
                        51: [2, 52],
                        52: [2, 52],
                        53: [2, 52],
                        54: [2, 52],
                        55: [2, 52],
                        56: [2, 52],
                        57: [2, 52],
                        58: [2, 52],
                        59: [2, 52],
                        60: [2, 52],
                        61: [2, 52]
                    }, {
                        22: [2, 53],
                        49: [2, 53],
                        50: [2, 53],
                        51: [2, 53],
                        52: [2, 53],
                        53: [2, 53],
                        54: [2, 53],
                        55: [2, 53],
                        56: [2, 53],
                        57: [2, 53],
                        58: [2, 53],
                        59: [2, 53],
                        60: [2, 53],
                        61: [2, 53]
                    }, {
                        22: [2, 54],
                        49: [2, 54],
                        50: [2, 54],
                        51: [2, 54],
                        52: [2, 54],
                        53: [2, 54],
                        54: [2, 54],
                        55: [2, 54],
                        56: [2, 54],
                        57: [2, 54],
                        58: [2, 54],
                        59: [2, 54],
                        60: [2, 54],
                        61: [2, 54]
                    }, {
                        22: [2, 55],
                        49: [2, 55],
                        50: [2, 55],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 55],
                        57: [2, 55],
                        58: [2, 55],
                        59: [2, 55],
                        60: [2, 55],
                        61: [2, 55]
                    }, {
                        22: [2, 56],
                        49: [2, 56],
                        50: [2, 56],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 56],
                        57: [2, 56],
                        58: [2, 56],
                        59: [2, 56],
                        60: [2, 56],
                        61: [2, 56]
                    }, {
                        22: [2, 57],
                        49: [2, 57],
                        50: [2, 57],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 57],
                        57: [2, 57],
                        58: [2, 57],
                        59: [2, 57],
                        60: [2, 57],
                        61: [2, 57]
                    }, {
                        22: [2, 58],
                        49: [2, 58],
                        50: [2, 58],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 58],
                        57: [2, 58],
                        58: [2, 58],
                        59: [2, 58],
                        60: [2, 58],
                        61: [2, 58]
                    }, {
                        22: [2, 59],
                        49: [2, 59],
                        50: [2, 59],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 59],
                        57: [2, 59],
                        58: [2, 59],
                        59: [2, 59],
                        60: [2, 59],
                        61: [2, 59]
                    }, {
                        22: [2, 60],
                        49: [2, 60],
                        50: [2, 60],
                        51: [1, 147],
                        52: [1, 148],
                        53: [1, 149],
                        54: [1, 150],
                        55: [1, 151],
                        56: [2, 60],
                        57: [2, 60],
                        58: [2, 60],
                        59: [2, 60],
                        60: [2, 60],
                        61: [2, 60]
                    }, {
                        22: [2, 66],
                        49: [2, 66],
                        50: [2, 66],
                        51: [2, 66],
                        52: [2, 66],
                        53: [2, 66],
                        54: [2, 66],
                        55: [2, 66],
                        56: [2, 66],
                        57: [2, 66],
                        58: [2, 66],
                        59: [2, 66],
                        60: [2, 66],
                        61: [2, 66]
                    }, {
                        7: 211,
                        33: [1, 79],
                        36: 212,
                        80: [1, 80],
                        90: 81
                    }, {
                        5: [2, 27],
                        10: [2, 27],
                        19: [2, 27],
                        33: [2, 27],
                        34: [2, 27],
                        79: [2, 27]
                    }, {
                        5: [2, 28],
                        10: [2, 28],
                        19: [2, 28],
                        33: [2, 28],
                        34: [2, 28],
                        79: [2, 28]
                    }, {
                        22: [2, 31],
                        33: [2, 31]
                    }, {
                        81: [1, 213]
                    }, {
                        81: [1, 214]
                    }, {
                        81: [2, 104]
                    }, {
                        86: [1, 215]
                    }, {
                        81: [1, 216]
                    }, {
                        81: [1, 217]
                    }, {
                        93: [1, 218]
                    }, {
                        45: [2, 120],
                        72: [2, 120]
                    }, {
                        45: [2, 121],
                        72: [2, 121]
                    }, {
                        22: [2, 103],
                        44: [2, 103],
                        45: [2, 103],
                        49: [2, 103],
                        50: [2, 103],
                        51: [2, 103],
                        52: [2, 103],
                        53: [2, 103],
                        54: [2, 103],
                        55: [2, 103],
                        56: [2, 103],
                        57: [2, 103],
                        58: [2, 103],
                        59: [2, 103],
                        60: [2, 103],
                        61: [2, 103],
                        72: [2, 103],
                        79: [2, 103],
                        81: [2, 103]
                    }, {
                        22: [1, 219]
                    }, {
                        22: [1, 220]
                    }, {
                        22: [2, 114],
                        44: [2, 114],
                        45: [2, 114],
                        72: [2, 114],
                        81: [2, 114]
                    }, {
                        22: [2, 116],
                        44: [2, 116],
                        45: [2, 116],
                        72: [2, 116],
                        81: [2, 116]
                    }, {
                        81: [2, 105]
                    }, {
                        22: [2, 115],
                        44: [2, 115],
                        45: [2, 115],
                        72: [2, 115],
                        81: [2, 115]
                    }, {
                        22: [2, 117],
                        44: [2, 117],
                        45: [2, 117],
                        72: [2, 117],
                        81: [2, 117]
                    }, {
                        7: 221,
                        33: [1, 79],
                        36: 76,
                        43: 222,
                        47: 77,
                        52: [1, 90],
                        64: 78,
                        70: [1, 82],
                        80: [1, 80],
                        82: 83,
                        83: 84,
                        84: [1, 85],
                        85: 88,
                        86: [1, 89],
                        88: [1, 86],
                        89: [1, 87],
                        90: 81
                    }, {
                        5: [2, 24],
                        10: [2, 24],
                        19: [2, 24],
                        33: [2, 24],
                        34: [2, 24],
                        79: [2, 24]
                    }, {
                        5: [2, 25],
                        10: [2, 25],
                        19: [2, 25],
                        33: [2, 25],
                        34: [2, 25],
                        79: [2, 25]
                    }, {
                        45: [2, 123],
                        72: [2, 123]
                    }, {
                        45: [2, 124],
                        72: [2, 124]
                    }
                ],
                defaultActions: {
                    22: [2, 1],
                    29: [2, 75],
                    30: [2, 76],
                    109: [2, 45],
                    110: [2, 46],
                    182: [2, 44],
                    203: [2, 104],
                    215: [2, 105]
                },
                parseError: function parseError(str, hash) {
                    throw new Error(str);
                },
                parse: function parse(input) {
                    var self = this,
                        stack = [0],
                        vstack = [null],
                        lstack = [],
                        table = this.table,
                        yytext = "",
                        yylineno = 0,
                        yyleng = 0,
                        recovering = 0,
                        TERROR = 2,
                        EOF = 1;
                    this.lexer.setInput(input);
                    this.lexer.yy = this.yy;
                    this.yy.lexer = this.lexer;
                    this.yy.parser = this;
                    if (typeof this.lexer.yylloc == "undefined")
                        this.lexer.yylloc = {};
                    var yyloc = this.lexer.yylloc;
                    lstack.push(yyloc);
                    var ranges = this.lexer.options && this.lexer.options.ranges;
                    if (typeof this.yy.parseError === "function")
                        this.parseError = this.yy.parseError;

                    function popStack(n) {
                        stack.length = stack.length - 2 * n;
                        vstack.length = vstack.length - n;
                        lstack.length = lstack.length - n;
                    }

                    function lex() {
                        var token;
                        token = self.lexer.lex() || 1;
                        if (typeof token !== "number") {
                            token = self.symbols_[token] || token;
                        }
                        return token;
                    }
                    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
                    while (true) {
                        state = stack[stack.length - 1];
                        if (this.defaultActions[state]) {
                            action = this.defaultActions[state];
                        } else {
                            if (symbol === null || typeof symbol == "undefined") {
                                symbol = lex();
                            }
                            action = table[state] && table[state][symbol];
                        }
                        if (typeof action === "undefined" || !action.length || !action[0]) {
                            var errStr = "";
                            if (!recovering) {
                                expected = [];
                                for (p in table[state])
                                    if (this.terminals_[p] && p > 2) {
                                        expected.push("'" + this.terminals_[p] + "'");
                                    }
                                if (this.lexer.showPosition) {
                                    errStr = "Parse error on line " + (yylineno + 1) + ":\n" + this.lexer.showPosition() + "\nExpecting " + expected.join(", ") + ", got '" + (this.terminals_[symbol] || symbol) + "'";
                                } else {
                                    errStr = "Parse error on line " + (yylineno + 1) + ": Unexpected " + (symbol == 1 ? "end of input" : "'" + (this.terminals_[symbol] || symbol) + "'");
                                }
                                this.parseError(errStr, {
                                    text: this.lexer.match,
                                    token: this.terminals_[symbol] || symbol,
                                    line: this.lexer.yylineno,
                                    loc: yyloc,
                                    expected: expected
                                });
                            }
                        }
                        if (action[0] instanceof Array && action.length > 1) {
                            throw new Error("Parse Error: multiple actions possible at state: " + state + ", token: " + symbol);
                        }
                        switch (action[0]) {
                            case 1:
                                stack.push(symbol);
                                vstack.push(this.lexer.yytext);
                                lstack.push(this.lexer.yylloc);
                                stack.push(action[1]);
                                symbol = null;
                                if (!preErrorSymbol) {
                                    yyleng = this.lexer.yyleng;
                                    yytext = this.lexer.yytext;
                                    yylineno = this.lexer.yylineno;
                                    yyloc = this.lexer.yylloc;
                                    if (recovering > 0)
                                        recovering--;
                                } else {
                                    symbol = preErrorSymbol;
                                    preErrorSymbol = null;
                                }
                                break;
                            case 2:
                                len = this.productions_[action[1]][1];
                                yyval.$ = vstack[vstack.length - len];
                                yyval._$ = {
                                    first_line: lstack[lstack.length - (len || 1)].first_line,
                                    last_line: lstack[lstack.length - 1].last_line,
                                    first_column: lstack[lstack.length - (len || 1)].first_column,
                                    last_column: lstack[lstack.length - 1].last_column
                                };
                                if (ranges) {
                                    yyval._$.range = [lstack[lstack.length - (len || 1)].range[0], lstack[lstack.length - 1].range[1]];
                                }
                                r = this.performAction.call(yyval, yytext, yyleng, yylineno, this.yy, action[1], vstack, lstack);
                                if (typeof r !== "undefined") {
                                    return r;
                                }
                                if (len) {
                                    stack = stack.slice(0, -1 * len * 2);
                                    vstack = vstack.slice(0, -1 * len);
                                    lstack = lstack.slice(0, -1 * len);
                                }
                                stack.push(this.productions_[action[1]][0]);
                                vstack.push(yyval.$);
                                lstack.push(yyval._$);
                                newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
                                stack.push(newState);
                                break;
                            case 3:
                                return true;
                        }
                    }
                    return true;
                }
            };
            /* Jison generated lexer */
            var lexer = (function() {
                var lexer = ({
                    EOF: 1,
                    parseError: function parseError(str, hash) {
                        if (this.yy.parser) {
                            this.yy.parser.parseError(str, hash);
                        } else {
                            throw new Error(str);
                        }
                    },
                    setInput: function(input) {
                        this._input = input;
                        this._more = this._less = this.done = false;
                        this.yylineno = this.yyleng = 0;
                        this.yytext = this.matched = this.match = '';
                        this.conditionStack = ['INITIAL'];
                        this.yylloc = {
                            first_line: 1,
                            first_column: 0,
                            last_line: 1,
                            last_column: 0
                        };
                        if (this.options.ranges) this.yylloc.range = [0, 0];
                        this.offset = 0;
                        return this;
                    },
                    input: function() {
                        var ch = this._input[0];
                        this.yytext += ch;
                        this.yyleng++;
                        this.offset++;
                        this.match += ch;
                        this.matched += ch;
                        var lines = ch.match(/(?:\r\n?|\n).*/g);
                        if (lines) {
                            this.yylineno++;
                            this.yylloc.last_line++;
                        } else {
                            this.yylloc.last_column++;
                        }
                        if (this.options.ranges) this.yylloc.range[1]++;

                        this._input = this._input.slice(1);
                        return ch;
                    },
                    unput: function(ch) {
                        var len = ch.length;
                        var lines = ch.split(/(?:\r\n?|\n)/g);

                        this._input = ch + this._input;
                        this.yytext = this.yytext.substr(0, this.yytext.length - len - 1);
                        //this.yyleng -= len;
                        this.offset -= len;
                        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
                        this.match = this.match.substr(0, this.match.length - 1);
                        this.matched = this.matched.substr(0, this.matched.length - 1);

                        if (lines.length - 1) this.yylineno -= lines.length - 1;
                        var r = this.yylloc.range;

                        this.yylloc = {
                            first_line: this.yylloc.first_line,
                            last_line: this.yylineno + 1,
                            first_column: this.yylloc.first_column,
                            last_column: lines ?
                                (lines.length === oldLines.length ? this.yylloc.first_column : 0) + oldLines[oldLines.length - lines.length].length - lines[0].length : this.yylloc.first_column - len
                        };

                        if (this.options.ranges) {
                            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
                        }
                        return this;
                    },
                    more: function() {
                        this._more = true;
                        return this;
                    },
                    less: function(n) {
                        this.unput(this.match.slice(n));
                    },
                    pastInput: function() {
                        var past = this.matched.substr(0, this.matched.length - this.match.length);
                        return (past.length > 20 ? '...' : '') + past.substr(-20).replace(/\n/g, "");
                    },
                    upcomingInput: function() {
                        var next = this.match;
                        if (next.length < 20) {
                            next += this._input.substr(0, 20 - next.length);
                        }
                        return (next.substr(0, 20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
                    },
                    showPosition: function() {
                        var pre = this.pastInput();
                        var c = new Array(pre.length + 1).join("-");
                        return pre + this.upcomingInput() + "\n" + c + "^";
                    },
                    next: function() {
                        if (this.done) {
                            return this.EOF;
                        }
                        if (!this._input) this.done = true;

                        var token,
                            match,
                            tempMatch,
                            index,
                            col,
                            lines;
                        if (!this._more) {
                            this.yytext = '';
                            this.match = '';
                        }
                        var rules = this._currentRules();
                        for (var i = 0; i < rules.length; i++) {
                            tempMatch = this._input.match(this.rules[rules[i]]);
                            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                                match = tempMatch;
                                index = i;
                                if (!this.options.flex) break;
                            }
                        }
                        if (match) {
                            lines = match[0].match(/(?:\r\n?|\n).*/g);
                            if (lines) this.yylineno += lines.length;
                            this.yylloc = {
                                first_line: this.yylloc.last_line,
                                last_line: this.yylineno + 1,
                                first_column: this.yylloc.last_column,
                                last_column: lines ? lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length : this.yylloc.last_column + match[0].length
                            };
                            this.yytext += match[0];
                            this.match += match[0];
                            this.matches = match;
                            this.yyleng = this.yytext.length;
                            if (this.options.ranges) {
                                this.yylloc.range = [this.offset, this.offset += this.yyleng];
                            }
                            this._more = false;
                            this._input = this._input.slice(match[0].length);
                            this.matched += match[0];
                            token = this.performAction.call(this, this.yy, this, rules[index], this.conditionStack[this.conditionStack.length - 1]);
                            if (this.done && this._input) this.done = false;
                            if (token) return token;
                            else return;
                        }
                        if (this._input === "") {
                            return this.EOF;
                        } else {
                            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                                text: "",
                                token: null,
                                line: this.yylineno
                            });
                        }
                    },
                    lex: function lex() {
                        var r = this.next();
                        if (typeof r !== 'undefined') {
                            return r;
                        } else {
                            return this.lex();
                        }
                    },
                    begin: function begin(condition) {
                        this.conditionStack.push(condition);
                    },
                    popState: function popState() {
                        return this.conditionStack.pop();
                    },
                    _currentRules: function _currentRules() {
                        return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
                    },
                    topState: function() {
                        return this.conditionStack[this.conditionStack.length - 2];
                    },
                    pushState: function begin(condition) {
                        this.begin(condition);
                    }
                });
                lexer.options = {};
                lexer.performAction = function anonymous(yy, yy_, $avoiding_name_collisions, YY_START) {

                    var YYSTATE = YY_START
                    switch ($avoiding_name_collisions) {
                        case 0:
                            var _reg = /\\+$/;
                            var _esc = yy_.yytext.match(_reg);
                            var _num = _esc ? _esc[0].length : null;
                            /*转义实现，非常恶心，暂时没有好的解决方案*/
                            if (!_num || !(_num % 2)) {
                                this.begin("mu");
                            } else {
                                yy_.yytext = yy_.yytext.replace(/\\$/, '');
                                this.begin('esc');
                            }
                            if (_num > 1) yy_.yytext = yy_.yytext.replace(/(\\\\)+$/, '\\');
                            if (yy_.yytext) return 79;

                            break;
                        case 1:
                            var _reg = /\\+$/;
                            var _esc = yy_.yytext.match(_reg);
                            var _num = _esc ? _esc[0].length : null;
                            if (!_num || !(_num % 2)) {
                                this.begin("h");
                            } else {
                                yy_.yytext = yy_.yytext.replace(/\\$/, '');
                                this.begin('esc');
                            }
                            if (_num > 1) yy_.yytext = yy_.yytext.replace(/(\\\\)+$/, '\\');
                            if (yy_.yytext) return 79;

                            break;
                        case 2:
                            return 79;
                            break;
                        case 3:
                            this.popState();
                            return 10;
                            break;
                        case 4:
                            this.popState();
                            yy_.yytext = yy_.yytext.replace(/^#\[\[|\]\]#$/g, '');
                            return 79
                            break;
                        case 5:
                            this.popState();
                            return 10;
                            break;
                        case 6:
                            return 19;
                            break;
                        case 7:
                            return 25;
                            break;
                        case 8:
                            return 27;
                            break;
                        case 9:
                            return 29;
                            break;
                        case 10:
                            this.popState();
                            return 30;
                            break;
                        case 11:
                            this.popState();
                            return 30;
                            break;
                        case 12:
                            this.popState();
                            return 31;
                            break;
                        case 13:
                            this.popState();
                            return 37;
                            break;
                        case 14:
                            return 32;
                            break;
                        case 15:
                            return 20;
                            break;
                        case 16:
                            return 38;
                            break;
                        case 17:
                            return 39;
                            break;
                        case 18:
                            return 35;
                            break;
                        case 19:
                            return yy_.yytext;
                            break;
                        case 20:
                            return yy_.yytext;
                            break;
                        case 21:
                            return yy_.yytext;
                            break;
                        case 22:
                            return yy_.yytext;
                            break;
                        case 23:
                            return yy_.yytext;
                            break;
                        case 24:
                            return yy_.yytext;
                            break;
                        case 25:
                            return yy_.yytext;
                            break;
                        case 26:
                            return yy_.yytext;
                            break;
                        case 27:
                            return 33;
                            break;
                        case 28:
                            return 33;
                            break;
                        case 29:
                            return yy_.yytext;
                            break;
                        case 30:
                            return 46;
                            break;
                        case 31:
                            var conditionStack = this.conditionStack;
                            var len = conditionStack.length;
                            if (len >= 2 && conditionStack[len - 1] === 'c' && conditionStack[len - 2] === 'run') {
                                return 44;
                            }

                            break;
                        case 32:
                            /*ignore whitespace*/
                            break;
                        case 33:
                            return 70;
                            break;
                        case 34:
                            return 72;
                            break;
                        case 35:
                            return 93;
                            break;
                        case 36:
                            yy.begin = true;
                            return 69;
                            break;
                        case 37:
                            this.popState();
                            if (yy.begin === true) {
                                yy.begin = false;
                                return 71;
                            } else {
                                return 'CONTENT';
                            }
                            break;
                        case 38:
                            this.begin("c");
                            return 21;
                            break;
                        case 39:
                            if (this.popState() === "c") {
                                var conditionStack = this.conditionStack;
                                var len = conditionStack.length;

                                if (conditionStack[len - 1] === 'run') {
                                    this.popState();
                                    len = len - 1;
                                }

                                /** 遇到#set(a = b)括号结束后结束状态h*/
                                if (len === 2 && conditionStack[1] === "h") {
                                    this.popState();
                                } else if (len === 3 && conditionStack[1] === "mu" && conditionStack[2] === "h") {
                                    // issue#7 $foo#if($a)...#end
                                    this.popState();
                                    this.popState();
                                }

                                return 22;
                            } else {
                                return 'CONTENT';
                            }

                            break;
                        case 40:
                            this.begin("i");
                            return 80;
                            break;
                        case 41:
                            if (this.popState() === "i") {
                                return 81;
                            } else {
                                return 'CONTENT';
                            }

                            break;
                        case 42:
                            return 91;
                            break;
                        case 43:
                            return 77;
                            break;
                        case 44:
                            return 87;
                            break;
                        case 45:
                            return 45;
                            break;
                        case 46:
                            yy_.yytext = yy_.yytext.substr(1, yy_.yyleng - 2).replace(/\\"/g, '"');
                            return 89;
                            break;
                        case 47:
                            yy_.yytext = yy_.yytext.substr(1, yy_.yyleng - 2).replace(/\\'/g, "'");
                            return 88;
                            break;
                        case 48:
                            return 84;
                            break;
                        case 49:
                            return 84;
                            break;
                        case 50:
                            return 84;
                            break;
                        case 51:
                            return 86;
                            break;
                        case 52:
                            return 34;
                            break;
                        case 53:
                            this.begin("run");
                            return 34;
                            break;
                        case 54:
                            this.begin('h');
                            return 19;
                            break;
                        case 55:
                            this.popState();
                            return 79;
                            break;
                        case 56:
                            this.popState();
                            return 79;
                            break;
                        case 57:
                            this.popState();
                            return 79;
                            break;
                        case 58:
                            this.popState();
                            return 5;
                            break;
                        case 59:
                            return 5;
                            break;
                    }
                };
                lexer.rules = [/^(?:[^#]*?(?=\$))/, /^(?:[^\$]*?(?=#))/, /^(?:[^\x00]+)/, /^(?:#\*[\s\S]+?\*#)/, /^(?:#\[\[[\s\S]+?\]\]#)/, /^(?:##[^\n]+)/, /^(?:#(?=[a-zA-Z{]))/, /^(?:set[ ]*)/, /^(?:if[ ]*)/, /^(?:elseif[ ]*)/, /^(?:else\b)/, /^(?:\{else\})/, /^(?:end\b)/, /^(?:break\b)/, /^(?:foreach[ ]*)/, /^(?:noescape\b)/, /^(?:define[ ]*)/, /^(?:macro[ ]*)/, /^(?:in\b)/, /^(?:[%\+\-\*/])/, /^(?:<=)/, /^(?:>=)/, /^(?:[><])/, /^(?:==)/, /^(?:\|\|)/, /^(?:&&)/, /^(?:!=)/, /^(?:\$!(?=[{a-zA-Z_]))/, /^(?:\$(?=[{a-zA-Z_]))/, /^(?:!)/, /^(?:=)/, /^(?:[ ]+(?=[^,]))/, /^(?:\s+)/, /^(?:\{)/, /^(?:\})/, /^(?::)/, /^(?:\{)/, /^(?:\})/, /^(?:\([\s]*(?=[$'"\[\{\-0-9\w()!]))/, /^(?:\))/, /^(?:\[[\s]*(?=[\-$"'0-9{\[\]]+))/, /^(?:\])/, /^(?:\.\.)/, /^(?:\.(?=[a-zA-Z_]))/, /^(?:\.(?=[\d]))/, /^(?:,[ ]*)/, /^(?:"(\\"|[^\"])*")/, /^(?:'(\\'|[^\'])*')/, /^(?:null\b)/, /^(?:false\b)/, /^(?:true\b)/, /^(?:[0-9]+)/, /^(?:[_a-zA-Z][a-zA-Z0-9_\-]*)/, /^(?:[_a-zA-Z][a-zA-Z0-9_\-]*[ ]*(?=\())/, /^(?:#)/, /^(?:.)/, /^(?:\s+)/, /^(?:[\$#])/, /^(?:$)/, /^(?:$)/];
                lexer.conditions = {
                    "mu": {
                        "rules": [5, 27, 28, 36, 37, 38, 39, 40, 41, 43, 52, 54, 55, 56, 58],
                        "inclusive": false
                    },
                    "c": {
                        "rules": [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
                        "inclusive": false
                    },
                    "i": {
                        "rules": [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 33, 34, 34, 35, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
                        "inclusive": false
                    },
                    "h": {
                        "rules": [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 27, 28, 29, 30, 35, 38, 39, 40, 41, 43, 51, 53, 55, 56, 58],
                        "inclusive": false
                    },
                    "esc": {
                        "rules": [57],
                        "inclusive": false
                    },
                    "run": {
                        "rules": [27, 28, 29, 31, 32, 33, 34, 35, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 55, 56, 58],
                        "inclusive": false
                    },
                    "INITIAL": {
                        "rules": [0, 1, 2, 59],
                        "inclusive": true
                    }
                };
                return lexer;
            })()
            parser.lexer = lexer;

            function Parser() {
                this.yy = {};
            }
            Parser.prototype = parser;
            parser.Parser = Parser;
            return new Parser;
        })();

        function makeLevel(block, index) {

            var blockTypes = {
                'if': 1,
                'foreach': 1,
                'macro': 1,
                'noescape': 1,
                'define': 1
            };
            var len = block.length;
            index = index || 0;
            var ret = [];
            var ignore = index - 1;

            for (var i = index; i < len; i++) {

                if (i <= ignore) continue;

                var ast = block[i];
                var type = ast.type;

                if (!blockTypes[type] && type !== 'end') {

                    ret.push(ast);

                } else if (type === 'end') {

                    return {
                        arr: ret,
                        step: i
                    };

                } else {

                    var _ret = makeLevel(block, i + 1);
                    ignore = _ret.step;
                    _ret.arr.unshift(block[i]);
                    ret.push(_ret.arr);

                }

            }

            return ret;
        }
        velocity._parse = velocity.parse;
        velocity.parse = function(str) {
            var asts = velocity._parse(str);
            return makeLevel(asts);
        };

        return velocity;
    }());

    // velocityjs
    var velocityjs = {
        render: function(tmpl, context) {
            var ast = velocity.parse(tmpl);
            var html = new Velocity(ast).render(context);
            return html;
        }
    };

    window.velocityjs = velocityjs;
}(window._));
