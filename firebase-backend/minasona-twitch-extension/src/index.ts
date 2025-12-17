import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { https } from "firebase-functions/v2";

initializeApp();
const db = getFirestore();

export const getMinasonas = https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "public, max-age=300, s-maxage=600");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  try {
    const doc = await db.collection("minasonas").doc("all_minasonas").get();

    const minasonaMap: Record<string, string> = doc.data();

    res.status(200).json(minasonaMap);
  } catch (error) {
    console.error("Error fetching minasonas:", error);
    res.status(500).send("Internal Server Error");
  }
});
