import { useWorkspace } from "@/contexts/workspace-context";
import {
  isBoolType,
  isEnumType,
  isExprType,
  isFloatType,
  isIntType,
  isJsonType,
  isStringType,
  NodeArg,
  NodeDef,
  NodeModel,
  TreeGraphData,
  TreeModel,
  unknownNodeDef,
} from "@/misc/b3type";
import i18n from "@/misc/i18n";
import * as fs from "fs";
import { message } from "./hooks";
import { isMacos } from "./keys";
import Path from "./path";
import { zhNodeDef } from "./template";

let ctx: CanvasRenderingContext2D | null = null;
let defaultFontSize = "";
const textWidthMap = new Map<string, number>();

const isAsciiChar = (c: number) => {
  return (c >= 0x0001 && c <= 0x007e) || (0xff60 <= c && c <= 0xff9f);
};

const calcTextWith = (text: string, fontSize?: string) => {
  fontSize = fontSize ?? defaultFontSize;
  let b3Workspace: HTMLDivElement | null;
  let css: CSSStyleDeclaration | null;
  if (!fontSize) {
    b3Workspace = document.querySelector(".b3-workspace");
    if (b3Workspace) {
      css = getComputedStyle(b3Workspace);
      defaultFontSize = css.fontSize || "13px";
      fontSize = defaultFontSize;
    }
  }
  const key = `${text}-${fontSize}`;
  let width = textWidthMap.get(key);
  if (!width) {
    b3Workspace ||= document.querySelector(".b3-workspace");
    if (b3Workspace) {
      css ||= getComputedStyle(b3Workspace);
      ctx = ctx || document.createElement("canvas").getContext("2d")!;
      ctx.font = `${fontSize} ${css.fontFamily}`;
      const metrics = ctx.measureText(text);
      width = metrics.width;
      width = width - (isMacos ? 1.6 : 0.8);
      textWidthMap.set(key, width);
    }
  }
  return width ?? 13;
};

export const isSubtreeRoot = (data: TreeGraphData) => {
  return data.path && data.id.toString() !== "1";
};

export const isSubtreeUpdated = (data: TreeGraphData) => {
  if (data.path) {
    try {
      const subtreePath = useWorkspace.getState().workdir + "/" + data.path;
      if (fs.statSync(subtreePath).mtimeMs !== data.lastModified) {
        return true;
      }
    } catch (error) {
      return true;
    }
  }
  if (data.children) {
    for (const child of data.children) {
      if (isSubtreeUpdated(child)) {
        return true;
      }
    }
  }
  return false;
};

export const isNodeEqual = (node1: NodeModel, node2: NodeModel) => {
  if (
    node1.name === node2.name &&
    node1.desc === node2.desc &&
    node1.path === node2.path &&
    node1.debug === node2.debug &&
    node1.disabled === node2.disabled
  ) {
    const def = useWorkspace.getState().getNodeDef(node1.name);

    for (const arg of def.args ?? []) {
      if (node1.args?.[arg.name] !== node2.args?.[arg.name]) {
        return false;
      }
    }

    if (def.input?.length) {
      for (let i = 0; i < def.input.length; i++) {
        if (node1.input?.[i] !== node2.input?.[i]) {
          return false;
        }
      }
    }

    if (def.output?.length) {
      for (let i = 0; i < def.output.length; i++) {
        if (node1.output?.[i] !== node2.output?.[i]) {
          return false;
        }
      }
    }

    return true;
  }
  return false;
};

const error = (data: NodeModel | TreeGraphData, msg: string) => {
  console.error(`check ${data.id}|${data.name}: ${msg}`);
};

export const getNodeArgRawType = (arg: NodeArg) => {
  return arg.type.match(/^\w+/)![0] as NodeArg["type"];
};

export const isNodeArgArray = (arg: NodeArg) => {
  return arg.type.includes("[]");
};

export const isNodeArgOptional = (arg: NodeArg) => {
  return arg.type.includes("?");
};

export const checkNodeArgValue = (
  data: NodeModel | TreeGraphData,
  arg: NodeArg,
  value: unknown,
  verbose?: boolean
) => {
  let hasError = false;
  const type = getNodeArgRawType(arg);
  if (isFloatType(type)) {
    const isNumber = typeof value === "number";
    const isOptional = value === undefined && isNodeArgOptional(arg);
    if (!(isNumber || isOptional)) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not a number`);
      }
      hasError = true;
    }
  } else if (isIntType(type)) {
    const isInt = typeof value === "number" && value === Math.floor(value);
    const isOptional = value === undefined && isNodeArgOptional(arg);
    if (!(isInt || isOptional)) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not a int`);
      }
      hasError = true;
    }
  } else if (isStringType(type)) {
    const isString = typeof value === "string" && value;
    const isOptional = (value === undefined || value === "") && isNodeArgOptional(arg);
    if (!(isString || isOptional)) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not a string`);
      }
      hasError = true;
    }
  } else if (isEnumType(type)) {
    const isEnum = !!arg.options?.find((option) => option.value === value);
    const isOptional = value === undefined && isNodeArgOptional(arg);
    if (!(isEnum || isOptional)) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not a one of the option values`);
      }
      hasError = true;
    }
  } else if (isExprType(type)) {
    const isExpr = typeof value === "string" && value;
    const isOptional = (value === undefined || value === "") && isNodeArgOptional(arg);
    if (!(isExpr || isOptional)) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not an expr string`);
      }
      hasError = true;
    }
  } else if (isJsonType(type)) {
    const isJson = value !== undefined && value !== "";
    const isOptional = isNodeArgOptional(arg);
    if (!(isJson || isOptional)) {
      if (verbose) {
        error(data, `'${arg.name}=${value}' is not an invalid object`);
      }
      hasError = true;
    }
  } else if (isBoolType(type)) {
    const isBool = typeof value === "boolean" || value === undefined;
    if (!isBool) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not a boolean`);
      }
      hasError = true;
    }
  } else {
    error(data, `unknown arg type '${arg.type}'`);
  }

  return !hasError;
};

export const checkNodeArg = (
  data: NodeModel | TreeGraphData,
  conf: NodeDef,
  i: number,
  verbose?: boolean
) => {
  let hasError = false;
  const arg = conf.args![i] as NodeArg;
  const value = data.args?.[arg.name];
  if (isNodeArgArray(arg)) {
    if (!Array.isArray(value) || (!isNodeArgOptional(arg) && value.length === 0)) {
      if (verbose) {
        error(data, `'${arg.name}=${JSON.stringify(value)}' is not an array or empty array`);
      }
      hasError = true;
    } else {
      for (let j = 0; j < value.length; j++) {
        if (!checkNodeArgValue(data, arg, value[j], verbose)) {
          hasError = true;
        }
      }
    }
  } else if (!checkNodeArgValue(data, arg, value, verbose)) {
    hasError = true;
  }
  if (arg.oneof !== undefined) {
    const idx = conf.input?.findIndex((v) => v.startsWith(arg.oneof!)) ?? -1;
    if (!checkOneof(data.args?.[arg.name], data.input?.[idx])) {
      if (verbose) {
        error(
          data,
          `only one is allowed for between argument '${arg.name}' and input '${data.input?.[idx]}'`
        );
      }
      hasError = true;
    }
  }

  return !hasError;
};

export const checkOneof = (argValue: unknown, inputValue: unknown) => {
  argValue = argValue === undefined ? "" : argValue;
  inputValue = inputValue ?? "";
  return (argValue !== "" && inputValue === "") || (argValue === "" && inputValue !== "");
};

export const checkNodeData = (data: NodeModel | null | undefined) => {
  if (!data) {
    return false;
  }
  const conf = useWorkspace.getState().getNodeDef(data.name);
  if (conf.name === unknownNodeDef.name) {
    error(data, `undefined node: ${data.name}`);
    return false;
  }

  let hasError = false;

  if (conf.children !== undefined && conf.children !== -1) {
    const count = data.children?.length || 0;
    if (conf.children !== count) {
      hasError = true;
      error(data, `expect ${conf.children} children, but got ${count}`);
    }
  }

  let hasVaridicInput = false;
  if (conf.input) {
    for (let i = 0; i < conf.input.length; i++) {
      if (!data.input) {
        data.input = [];
      }
      if (!data.input[i]) {
        data.input[i] = "";
      }
      if (!isValidInputOrOutput(conf.input, data.input, i)) {
        error(data, `intput field '${conf.input[i]}' is required`);
        hasError = true;
      }
      if (i === conf.input.length - 1 && conf.input.at(-1)?.endsWith("...")) {
        hasVaridicInput = true;
      }
    }
  }
  if (data.input && !hasVaridicInput) {
    data.input.length = conf.input?.length || 0;
  }

  let hasVaridicOutput = false;
  if (conf.output) {
    for (let i = 0; i < conf.output.length; i++) {
      if (!data.output) {
        data.output = [];
      }
      if (!data.output[i]) {
        data.output[i] = "";
      }
      if (!isValidInputOrOutput(conf.output, data.output, i)) {
        error(data, `output field '${conf.output[i]}' is required`);
        hasError = true;
      }
      if (i === conf.output.length - 1 && conf.output.at(-1)?.endsWith("...")) {
        hasVaridicOutput = true;
      }
    }
  }
  if (data.output && !hasVaridicOutput) {
    data.output.length = conf.output?.length || 0;
  }
  if (conf.args) {
    const args: { [k: string]: unknown } = {};
    for (let i = 0; i < conf.args.length; i++) {
      const key = conf.args[i].name;
      const value = data.args?.[key];
      if (value !== undefined) {
        args[key] = value;
      }
      if (!checkNodeArg(data, conf, i, true)) {
        hasError = true;
      }
    }
    data.args = args;
  }

  if (data.children) {
    for (const child of data.children) {
      if (!checkNodeData(child)) {
        hasError = true;
      }
    }
  } else {
    data.children = [];
  }

  return !hasError;
};

export const copyFromNode = (data: TreeGraphData, node: NodeModel) => {
  data.name = node.name;
  data.debug = node.debug;
  data.disabled = node.disabled;
  data.desc = node.desc;
  data.path = node.path;
  data.args = node.args;
  data.input = node.input;
  data.output = node.output;
};

const parsingStack: string[] = [];

export const createNode = (data: TreeGraphData, includeChildren: boolean = true) => {
  const node: NodeModel = {
    id: Number(data.id),
    name: data.name,
    desc: data.desc,
    path: data.path,
    debug: data.debug,
    disabled: data.disabled,
  };
  if (data.input) {
    node.input = [];
    for (const v of data.input) {
      node.input.push(v ?? "");
    }
  }
  if (data.output) {
    node.output = [];
    for (const v of data.output) {
      node.output.push(v ?? "");
    }
  }
  if (data.args) {
    node.args = {};
    for (const k in data.args) {
      const v = data.args[k];
      if (v !== undefined) {
        node.args[k] = v;
      }
    }
  }
  if (data.children && !isSubtreeRoot(data) && includeChildren) {
    node.children = [];
    for (const child of data.children) {
      node.children.push(createNode(child));
    }
  }
  return node;
};

const enum StatusFlag {
  SUCCESS = 2,
  FAILURE = 1,
  RUNNING = 0,
  SUCCESS_ZERO = 5,
  FAILURE_ZERO = 4,
}

const toStatusFlag = (data: TreeGraphData) => {
  let status = 0;
  data.def.status?.forEach((s) => {
    switch (s) {
      case "success":
        status |= 1 << StatusFlag.SUCCESS;
        break;
      case "failure":
        status |= 1 << StatusFlag.FAILURE;
        break;
      case "running":
        status |= 1 << StatusFlag.RUNNING;
        break;
    }
  });
  return status;
};

const appendStatusFlag = (status: number, childStatus: number) => {
  const childSuccess = (childStatus >> StatusFlag.SUCCESS) & 1;
  const childFailure = (childStatus >> StatusFlag.FAILURE) & 1;
  if (childSuccess === 0) {
    status |= 1 << StatusFlag.SUCCESS_ZERO;
  }
  if (childFailure === 0) {
    status |= 1 << StatusFlag.FAILURE_ZERO;
  }
  status |= childStatus;
  return status;
};

const buildStatusFlag = (data: TreeGraphData, childStatus: number) => {
  let status = data.status!;
  if (data.def.status?.length) {
    const childSuccess = (childStatus >> StatusFlag.SUCCESS) & 1;
    const childFailure = (childStatus >> StatusFlag.FAILURE) & 1;
    const childRunning = (childStatus >> StatusFlag.RUNNING) & 1;
    const childHasZeroSuccess = (childStatus >> StatusFlag.SUCCESS_ZERO) & 1;
    const childHasZeroFailure = (childStatus >> StatusFlag.FAILURE_ZERO) & 1;
    data.def.status?.forEach((s) => {
      switch (s) {
        case "!success":
          status |= childFailure << StatusFlag.SUCCESS;
          break;
        case "!failure":
          status |= childSuccess << StatusFlag.FAILURE;
          break;
        case "|success":
          status |= childSuccess << StatusFlag.SUCCESS;
          break;
        case "|failure":
          status |= childFailure << StatusFlag.FAILURE;
          break;
        case "|running":
          status |= childRunning << StatusFlag.RUNNING;
          break;
        case "&success":
          if (childHasZeroSuccess) {
            status &= ~(1 << StatusFlag.SUCCESS);
          } else {
            status |= childSuccess << StatusFlag.SUCCESS;
          }
          break;
        case "&failure":
          if (childHasZeroFailure) {
            status &= ~(1 << StatusFlag.FAILURE);
          } else {
            status |= childFailure << StatusFlag.FAILURE;
          }
          break;
      }
    });
    data.status = status;
  } else {
    data.status = status | childStatus;
  }
};

export const refreshTreeDataId = (data: TreeGraphData, id?: number) => {
  if (!id) {
    id = 1;
  }
  const status = toStatusFlag(data);
  data.id = (id++).toString();
  data.status = status;
  if (data.children) {
    let childStatus = 0;
    data.children.forEach((child) => {
      child.parent = data.id;
      id = refreshTreeDataId(child, id);
      if (child.status && !child.disabled) {
        childStatus = appendStatusFlag(childStatus, child.status);
      }
    });
    buildStatusFlag(data, childStatus);
  }
  return id;
};

export const calcTreeDataSize = (data: TreeGraphData) => {
  let height = 50 + 2;
  const updateHeight = (obj: any) => {
    if ((Array.isArray(obj) && obj.length) || (obj && Object.keys(obj).length > 0)) {
      const { line } = toBreakWord(`${i18n.t("regnode.args")}${JSON.stringify(obj)}`, 200);
      height += 20 * line;
    }
  };
  if (data.path) {
    height += 20;
  }
  updateHeight(data.args);
  updateHeight(data.input);
  updateHeight(data.output);
  return [220, height];
};

export const checkChildrenLimit = (data: TreeGraphData) => {
  const conf = data.def;
  if (conf.children !== undefined && conf.children !== -1) {
    return (data.children?.length || 0) === conf.children;
  }
  return true;
};

const isValidInputOrOutput = (
  inputDef: string[],
  inputData: string[] | undefined,
  index: number
) => {
  return (
    inputDef[index].includes("?") ||
    inputData?.[index] ||
    (index === inputDef.length - 1 && inputDef[index].endsWith("..."))
  );
};

export const checkTreeData = (data: TreeGraphData) => {
  const conf = data.def;
  if (conf.input) {
    for (let i = 0; i < conf.input.length; i++) {
      if (!isValidInputOrOutput(conf.input, data.input, i)) {
        return false;
      }
    }
  }
  if (conf.output) {
    for (let i = 0; i < conf.output.length; i++) {
      if (!isValidInputOrOutput(conf.output, data.output, i)) {
        return false;
      }
    }
  }
  if (!checkChildrenLimit(data)) {
    return false;
  }
  if (conf.args) {
    for (let i = 0; i < conf.args.length; i++) {
      if (!checkNodeArg(data, conf, i, false)) {
        return false;
      }
    }
  }

  return true;
};

export const createTreeData = (node: NodeModel, parent?: string) => {
  const workspace = useWorkspace.getState();
  let treeData: TreeGraphData = {
    id: node.id.toFixed(),
    name: node.name,
    desc: node.desc,
    args: node.args,
    input: node.input,
    output: node.output,
    debug: node.debug,
    disabled: node.disabled,
    def: workspace.getNodeDef(node.name),
    parent: parent,
  };

  treeData.size = calcTreeDataSize(treeData);

  if (!parent) {
    parsingStack.length = 0;
  }

  if (node.children) {
    treeData.children = [];
    node.children.forEach((child) => {
      treeData.children!.push(createTreeData(child, treeData.id));
    });
  } else if (node.path) {
    if (parsingStack.indexOf(node.path) >= 0) {
      treeData.path = node.path;
      treeData.size = calcTreeDataSize(treeData);
      message.error(`循环引用节点：${node.path}`, 4);
      return treeData;
    }
    parsingStack.push(node.path);
    try {
      const subtreePath = workspace.workdir + "/" + node.path;
      const str = fs.readFileSync(subtreePath, "utf8");
      treeData = createTreeData(JSON.parse(str).root, treeData.id);
      treeData.lastModified = fs.statSync(subtreePath).mtimeMs;
      treeData.path = node.path;
      treeData.debug = node.debug;
      treeData.disabled = node.disabled;
      treeData.parent = parent;
      treeData.id = node.id.toFixed();
      treeData.size = calcTreeDataSize(treeData);
    } catch (e) {
      message.error(`解析子树失败：${node.path}`);
      console.log("parse subtree:", e);
    }
    parsingStack.pop();
  }
  calcTreeDataSize(treeData);
  return treeData;
};

export const createBuildData = (path: string) => {
  try {
    const str = fs.readFileSync(path, "utf8");
    const treeModel = JSON.parse(str);
    const data = createTreeData(treeModel.root);
    refreshTreeDataId(data);
    treeModel.root = createFileData(data, true);
    return treeModel as TreeModel;
  } catch (e) {
    console.log("build error:", path, e);
  }
  return null;
};

export const createFileData = (data: TreeGraphData, includeSubtree?: boolean) => {
  const nodeData: NodeModel = {
    id: Number(data.id),
    name: data.name,
    desc: data.desc || undefined,
    args: data.args || undefined,
    input: data.input || undefined,
    output: data.output || undefined,
    debug: data.debug || undefined,
    disabled: data.disabled || undefined,
    path: data.path || undefined,
  };
  const conf = useWorkspace.getState().getNodeDef(data.name);
  if (!conf.input?.length) {
    nodeData.input = undefined;
  }
  if (!conf.output?.length) {
    nodeData.output = undefined;
  }
  if (!conf.args?.length) {
    nodeData.args = undefined;
  }

  if (data.children?.length && (includeSubtree || !isSubtreeRoot(data))) {
    nodeData.children = [];
    data.children.forEach((child) => {
      nodeData.children!.push(createFileData(child, includeSubtree));
    });
  }
  return nodeData;
};

export const createNewTree = (path: string) => {
  const tree: TreeModel = {
    name: Path.basenameWithoutExt(path),
    root: {
      id: 1,
      name: "Sequence",
    },
  };
  return tree;
};

export const isTreeFile = (path: string) => {
  return path.toLocaleLowerCase().endsWith(".json");
};

export const toBreakWord = (str: string, maxWidth: number, fontSize?: string) => {
  const chars: string[] = [];
  let line = str.length > 0 ? 1 : 0;
  let width = maxWidth;
  for (let i = 0; i < str.length; i++) {
    width -= calcTextWith(str.charAt(i), fontSize);
    if (width > 0) {
      chars.push(str.charAt(i));
    } else {
      width = maxWidth;
      line++;
      chars.push("\n");
      i--;
    }
  }
  return {
    str: chars.join(""),
    line,
  };
};

export const cutWordTo = (str: string, maxWidth: number, fontSize?: string) => {
  let i = 0;
  for (; i < str.length; i++) {
    maxWidth -= calcTextWith(str.charAt(i), fontSize);
    if (maxWidth < 0) {
      i--;
      break;
    }
  }
  return str.slice(0, i) + (i < str.length - 1 ? "..." : "");
};

export const createProject = (path: string) => {
  fs.writeFileSync(Path.dirname(path) + "/node-config.b3-setting", zhNodeDef());
  fs.writeFileSync(
    Path.dirname(path) + "/example.json",
    JSON.stringify(
      {
        name: "example",
        root: {
          id: 1,
          name: "Sequence",
          children: [
            {
              id: 2,
              name: "Log",
              args: {
                str: "hello",
              },
            },
            {
              id: 3,
              name: "Wait",
              args: {
                time: 1,
              },
            },
          ],
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path,
    JSON.stringify(
      {
        nodeConf: "node-config.b3-setting",
        metadata: [],
      },
      null,
      2
    )
  );
};
