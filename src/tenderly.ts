import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const TENDERLY_API = `https://api.tenderly.co/api/v1/account/${process.env.TENDERLY_ACCOUNT}/project/${process.env.TENDERLY_PROJECT}/simulate`;

export async function getTenderlyResponse(tx: any): Promise<JSON> {
    const response = await fetch(TENDERLY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": process.env.TENDERLY_API_KEY || ""
      } as HeadersInit,
      body: JSON.stringify({
        network_id: tx.networkId,
        from: tx.from || ethers.ZeroAddress,
        to: tx.to,
        value: tx.value ? ethers.parseEther(tx.value).toString() : "0",
        input: tx.data || '0x',
        save: true,
        save_if_fails: false,
        simulation_type: "quick"
      })
    });
  
    return response.json();
  }