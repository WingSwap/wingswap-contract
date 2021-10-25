export const logData = (object: any, options = { text: "xxx", isToken: false }) => {
  const ether = Math.pow(10, 18);
  if (typeof object !== "object") {
    return console.log(options.text, object);
  }

  if (object._isBigNumber) {
    return console.log(options.text, object.toString() / ether);
  }
  const newObj = { ...object };
  Object.entries(newObj).forEach(([key, value]: [string, any]) => {
    if (typeof value === "object" && value._isBigNumber) {
      newObj[key] = value.toString() / ether;
    }
  });
  return console.log(options.text, newObj);
};
