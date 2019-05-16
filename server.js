const express = require('express');
const app = new express();

app.use(express.static(__dirname + '/dist'));

const port = process.env.PORT || 8080;
app.listen(port);
console.info(`Listening on port ${port}...`);
