export function applyTemplate(props: Record<string, any>, obj: any): any {
  if (typeof obj === "string") {
    if (new RegExp(`^{{{\\s*data\\s*}}}$`).test(obj.trim())) {
      return props.data;
    } else {
      for (let [key, value] of Object.entries(props)) {
        obj = obj.replaceAll(new RegExp(`(?<!{){{\\s*${key}\\s*}}(?!})`, "g"), value);
      }
      return obj;
    }
  } else if (Array.isArray(obj)) {
    return obj.map(elem => applyTemplate(props, elem));
  } else if (typeof obj === "object") {
    let result: Record<string, any> = {};
    for (let p in obj) {
      if (!obj.hasOwnProperty(p)) {
        continue;
      }
      result[p] = applyTemplate(props, obj[p]);
    }
    return result;
  } else {
    return obj;
  }
}
