const express = require('express');
const cors = require('cors'); 
const app = express();

app.use(cors()); 
app.use(express.json());
const sdk = require("node-appwrite");

const client = new sdk.Client();

client
    .setEndpoint("https://cloud.appwrite.io/v1")
    .setProject("66cc8ebd001c51d30f41")
    .setKey("61496135a8d148349be5367aa32959f07f5384b0a818eff477af141b66d22c3c54d92d17ac35442b21d7a6f9ed306b2eea0c40d74c1db3b60a04aefffb50844511b887b911cc693378589c82ca4e3b993fa3bb3604aee41f3685a122db4ef2985d3fe67dd76942bc3fd10276e4d3398b64d1942d454d7bfa7c15c536fccda073");


app.post('/api/data', (req, res) => {
    const { name, description } = req.body;
    const responseMessage = `Hi! ${name}, I just read about your description: ${description}`;
    res.json({ message: responseMessage });
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
