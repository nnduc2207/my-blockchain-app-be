const fs = require("fs")

const listNodes = () => {
  const dataJs = fs.readFileSync("nodes.json")
  const data = JSON.parse(dataJs)
  return data
}

const listNodesWithoutMe = (node) => {
  let data = listNodes()
  return data.filter((x) => x !== node)
}

const writeNodes = (data) => {
  const dataJs = JSON.stringify(data)
  fs.writeFileSync("nodes.json", dataJs)
}

const addNode = (node) => {
  const data = listNodes()
  if (!data.includes(node)) {
    data.push(node)
    writeNodes(data)
  }
}

const removeNode = (node) => {
  let data = listNodes()
  if (data.includes(node)) {
    data = data.filter((x) => x !== node)
    writeNodes(data)
  }
}

module.exports = {
  listNodes,
  listNodesWithoutMe,
  writeNodes,
  addNode,
  removeNode,
}
