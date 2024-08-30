import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import pinataSDK from "@pinata/sdk";
import { Client, Databases, ID, Query } from "node-appwrite";
import { Readable } from "stream";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const pinata = new pinataSDK({
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY,
});

const client = new Client();
client
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

const fileId = uuidv4();
const fileName = `nft_img_${fileId}.png`;

let IMAGEURL;
let METADATAURL;
let DATA;

async function storeImage(base64Data) {
  const baseData = decodeURIComponent(base64Data);

  if (baseData.includes(";base64")) {
    const buffer = Buffer.from(baseData.split(";base64,").pop(), "base64");

    const image = sharp(buffer);
    const metadata = await image.metadata();

    const newWidth = Math.round(metadata.width * 0.8);
    const newHeight = Math.round(metadata.height * 0.8);
    const resizedBuffer = await image
      .resize({ width: newWidth, height: newHeight })
      .toBuffer();

    const stream = new Readable();
    stream.push(resizedBuffer);
    stream.push(null);

    const result = await pinata.pinFileToIPFS(stream, {
      pinataMetadata: {
        name: fileName,
      },
    });

    return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
  } else {
    throw new Error("Invalid base64 data");
  }
}

async function storeMetadata(metadata) {
  const result = await pinata.pinJSONToIPFS(metadata);
  return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
}

app.post("/upload", async (req, res) => {
  try {
    const {
      publicKey,
      title,
      symbol,
      description,
      image,
      author,
      royalty,
      price,
      tags,
    } = req.body;

    if (
      !publicKey ||
      !title ||
      !symbol ||
      !description ||
      !image ||
      !author ||
      !royalty ||
      !price ||
      !tags
    ) {
      return res.status(400).json({ error: "All fields are required!" });
    }

    const numericRoyalty = parseFloat(royalty);
    const numericPrice = parseFloat(price);

    if (isNaN(numericRoyalty) || isNaN(numericPrice)) {
      return res
        .status(400)
        .json({ error: "Royalty and price must be valid numbers!" });
    }

    IMAGEURL = await storeImage(image);

    const metadata = {
      name: title,
      symbol: symbol,
      description: description,
      image: IMAGEURL,
      attributes: [
        { trait_type: "Author", value: author },
        { trait_type: "Royalty", value: numericRoyalty },
        { trait_type: "Price", value: numericPrice },
        { trait_type: "Platform", value: "Ruru NFT" },
      ],
      properties: {
        files: [{ uri: IMAGEURL, type: "image/png" }],
        category: "image",
      },
    };

    METADATAURL = await storeMetadata(metadata);

    DATA = {
      publicKey,
      title,
      symbol,
      description,
      image: IMAGEURL,
      author,
      royalty: numericRoyalty,
      price: numericPrice,
      tags,
      mintAddress: null,
      metaData: METADATAURL,
      currentOwner: null,
    };

    res.status(201).json({
      message: "NFT uploaded and minted successfully",
      metadataUrl: METADATAURL,
      imageUrl: IMAGEURL,
    });
  } catch (error) {
    console.error("Error", error);
    res
      .status(500)
      .json({ error: "Error uploading data", details: error.message });
  }
});

app.post("/mint", async (req, res) => {
  try {
    const { mintAddress, currentOwner } = req.body;

    if (!mintAddress) {
      return res.status(400).json({ error: "Mint Address Not Found" });
    }

    DATA = { ...DATA, mintAddress: mintAddress, currentOwner: currentOwner };

    const document = await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      ID.unique(),
      DATA
    );

    res.status(201).json({
      message: "NFT Successfully Created, Uploaded And Now Is Live",
      metadataUrl: METADATAURL,
      imageUrl: IMAGEURL,
    });
  } catch (error) {
    console.error("Error", error);
    res
      .status(500)
      .json({ error: "Error uploading data", details: error.message });
  }
});

app.get("/fetchAll", async (req, res) => {
  try {
    const documents = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID
    );

    if (documents.total === 0) {
      return res.status(404).json({ message: "No NFTs found" });
    }

    const filteredDocuments = documents.documents.map(doc => {
      const { $collectionId, $databaseId, $permissions, ...filteredData } = doc;
      return filteredData;
    });

    res.status(200).json({
      message: "NFTs fetched successfully",
      data: filteredDocuments,
    });
  } catch (error) {
    console.error("Error fetching NFTs", error);
    res.status(500).json({
      error: "Error fetching NFTs",
      details: error.message,
    });
  }
});



app.post("/fetchSingle", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Undefined NFT" });
    }

    const document = await databases.getDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      id 
    );

    const {$databaseId, $collectionId, $permissions, ...filteredData} = document;

    res.status(200).json({
      message: "NFT fetched successfully",
      data: filteredData,
    });
  } catch (error) {
    console.error("Error fetching NFT", error);

    if (error.code === 404) {
      return res.status(404).json({
        error: "NFT not found",
        details: error.message,
      });
    }

    res.status(500).json({
      error: "Error fetching NFT",
      details: error.message,
    });
  }
});

app.post("/updateNFT", async (req, res) => {
  try {
    const { id, newOwner } = req.body;

    if (!id || !newOwner) {
      return res.status(400).json({ error: "NFT ID and new owner are required!" });
    }

    const updatedDocument = await databases.updateDocument(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      id, 
      {
        currentOwner: newOwner,
      }
    );

    res.status(200).json({
      message: "NFT owner updated successfully",
      data: updatedDocument,
    });
  } catch (error) {
    console.error("Error updating NFT owner", error);

    if (error.code === 404) {
      return res.status(404).json({
        error: "NFT not found",
        details: error.message,
      });
    }

    res.status(500).json({
      error: "Error updating NFT owner",
      details: error.message,
    });
  }
});

app.post("/findMyNFTs", async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: "Public Key is required!" });
    }

    const documents = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_COLLECTION_ID,
      [
        Query.equal('publicKey', publicKey),
      ]
    );

    if (documents.total === 0) {
      return res.status(200).json({ message: "Empty" });
    }

    const filteredDocuments = documents.documents.map(doc => {
      const { $collectionId, $databaseId, $permissions, ...filteredData } = doc;
      return filteredData;
    });

    res.status(200).json({
      message: "NFTs fetched successfully",
      data: filteredDocuments,
    });
  } catch (error) {
    console.error("Error fetching NFTs by public key", error);
    res.status(500).json({
      error: "Error fetching NFTs by public key",
      details: error.message,
    });
  }
});



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
