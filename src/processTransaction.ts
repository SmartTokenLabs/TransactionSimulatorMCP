import { ethers } from "ethers";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { OpenAI } from 'openai';
import { WaterfallRpc } from "@smarttokenlabs/waterfall-rpc";

dotenv.config();

interface TokenInfo {
    standard: string;
    type: string;
    contract_address: string;
    symbol: string;
    name: string;
    logo: string;
    decimals: number;
    dollar_value: string;
}

interface BalanceChange {
    address: string;
    dollar_value: string;
    transfers: number[];
}

interface TransactionChange {
    token_info: TokenInfo;
    from: string;
    to: string;
    amount: string;
    raw_amount: string;
    dollar_value: string;
    sender_before_balance: string;
    to_before_balance: string;
}

interface BalanceDiff { 
    address: string;
    original: string;
    new: string;
}

interface BaseTokenBalance {
    address: string;
    original: string;
}

interface TransactionAnalysis {
    sender_wallet_address: string;
    target_address: string;
    target_contract: string;
    target_contract_name: string;
    function_name: string;
    status: boolean;
    gas_used: number;
    token_changes: TransactionChange[];
    balance_changes: BalanceChange[];
    balance_diff: BalanceDiff[];
    base_token_balances: BaseTokenBalance[];
}

//ERC20 balanceOf ABI
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256 balance)",
    "function name() view returns (string)"
];

//get the balance of a token ERC20 or ERC721 using RPC call. We should get decimals from the Tenderly return
async function getTokenBalance(tokenAddress: string, address: string, decimals: number, provider: ethers.JsonRpcProvider): Promise<string> {
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const balance = await contract.balanceOf(address);
    //convert raw balance to decimal
    const decimalBalance = ethers.formatUnits(balance, decimals);
    return decimalBalance;
}

//now fetch the eth balance of an address using RPC call
async function getEthBalance(address: string, provider: ethers.JsonRpcProvider): Promise<string> {
    const balance = await provider.getBalance(address);
    //convert wei balance to eth
    const ethBalance = ethers.formatEther(balance);
    return ethBalance;
}

async function getContractName(contractAddress: string, provider: ethers.JsonRpcProvider): Promise<string> {
    const contract = new ethers.Contract(contractAddress, erc20Abi, provider);
    return await contract.name();
}

function formPrompt(targettedResult: any, useEmojis: boolean) {
    const emojis = useEmojis ? "You can use emojis to emphasise the results" : "Do not use any emojis in your response";
    return `Analyse this transaction simulation and write a human readable summary of what this transaction result means?. Note that the transaction hasn't yet happened. The user wants to know if this transaction is safe; doesn't have any hidden outcome. If it's a token or eth transfer include the amount of that token currently in both from and to wallets. If there is an error in the transaction, explain why it would fail. ${emojis}:
        ${JSON.stringify(targettedResult, null, 2)}`;
}

export async function useOpenAI(targettedResult: any, useEmojis: boolean) {
    const prompt = formPrompt(targettedResult, useEmojis);

    let openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        maxRetries: 3
    });

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
        }, { timeout: 30000 }); // 30 seconds timeout for the request

        return response.choices[0].message.content;
    } catch (error) {
        if (error instanceof Error && error.message.includes('timeout')) {
            return "Analysis timed out. Please try again.";
        }
        console.error("OpenAI error:", error);
        return "Error analyzing transaction.";
    }
}

export async function useGemini(targettedResult: any, useEmojis: boolean) {

    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = formPrompt(targettedResult, useEmojis);

    const geminiResult = await model.generateContent(prompt);
    const geminiResponse = geminiResult.response;
    return geminiResponse.text();
}

// Helper functions
async function decodeTransactionData(data: string): Promise<string> {
    // Extract function signature (first 4 bytes after 0x)
    const funcSig: string = data.slice(0, 10);
    try {
        
        // simply look it up on 4-bytes.org
        const response = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${funcSig}`);
        const result = await response.json();

        //generally we need to pick the last entry on the list (the first entry is the most recent)
        if (!result || !result.results || result.results.length === 0) {
            return funcSig;
        } else {
            const lastEntry = result.results[result.results.length - 1];
            return lastEntry.text_signature || funcSig;
        }
    } catch (error) {
        return funcSig;
    }
}

function transformStateDiffToBalanceDiff(stateDiff: any[]): BalanceDiff[] {
    return stateDiff.map(diff => ({
        address: diff.address,
        original: diff.original,
        new: diff.dirty
    }));
}

export async function processTransactionData(result: any): Promise<TransactionAnalysis> {
    const txInfo = result.transaction.transaction_info;
    const assetChanges = txInfo.asset_changes || [];

    // console.log(`txnetwork_id: ${result.transaction.network_id}`);
    const networkId = parseInt(result.transaction.network_id);
    const provider = await WaterfallRpc.createProvider(networkId);

    let targetContract = "";
    let targetAddress = "";
    let targetContractName = "";

    const tokenChanges = assetChanges.map((change: any) => ({
        token_info: {
            standard: change.token_info.standard,
            type: change.token_info.type,
            contract_address: change.token_info.contract_address,
            symbol: change.token_info.symbol,
            name: change.token_info.name,
            decimals: change.token_info.decimals,
            dollar_value: change.token_info.dollar_value
        },
        from: change.from,
        to: change.to,
        amount: change.amount,
        raw_amount: change.raw_amount,
        dollar_value: change.dollar_value,
        token_id: change.token_id
    }));

    // get balance of each token in the tokenChanges array
    for (const tokenChange of tokenChanges) {
        if (tokenChange.token_info.contract_address === result.transaction.to) {
            targetContract = tokenChange.token_info.contract_address;
            if (tokenChange.token_info.name) {
                targetContractName = tokenChange.token_info.name;
            } else {
                targetContractName = await getContractName(targetContract, provider);
            }
        }

        let decimals = 18;
        if (tokenChange.token_info.decimals) {
            decimals = tokenChange.token_info.decimals;
        } 
        
        if (tokenChange.token_info.standard === "ERC721" || tokenChange.token_info.standard === "ERC1155") {
            decimals = 0;
            if (tokenChange.token_id && tokenChange.token_id !== null) {
                tokenChange.token_id = parseInt(tokenChange.token_id, 16);
            }
        } else {
            //remove token_id from the object
            delete tokenChange.token_id;
            if (tokenChange.token_info.standard === "ERC20") {
                //now set amount if not already set. Assume 18 decimals if not set  
                if (tokenChange.raw_amount !== null && tokenChange.amount == null) {
                    //convert raw_amount to decimal
                    tokenChange.amount = ethers.formatUnits(tokenChange.raw_amount, decimals);
                    //delete raw_amount
                    delete tokenChange.raw_amount;
                }
            }
        }

        if (tokenChange.dollar_value == null) {
            delete tokenChange.dollar_value;
        }

        if (tokenChange.from) {
            // console.log("tokenChange.from", tokenChange.from);
            const balance = await getTokenBalance(tokenChange.token_info.contract_address, tokenChange.from, decimals, provider);
            tokenChange.from_before_balance = balance;
        } 
        
        if (tokenChange.to) {
            // console.log("tokenChange.to", tokenChange.to);
            const balance = await getTokenBalance(tokenChange.token_info.contract_address, tokenChange.to, decimals, provider);
            tokenChange.to_before_balance = balance;
        }
    }

    if (targetContract === "") {
        targetAddress = result.transaction.to;
    }

    //grab the function name:
    const functionName = await decodeTransactionData(result.transaction.input);

    const balanceDiffs : BalanceDiff[] = transformStateDiffToBalanceDiff(txInfo.balance_diff);

    const baseTokenBalances : BaseTokenBalance[] = [];

    //now add base token balance before the transaction
    const baseTokenBalance = await getEthBalance(result.transaction.from, provider);
    baseTokenBalances.push({
        address: result.transaction.from,
        original: baseTokenBalance
    });

    return {
        sender_wallet_address: result.transaction.from,
        target_address: targetAddress,
        target_contract: targetContract,
        target_contract_name: targetContractName,
        function_name: functionName,
        status: result.transaction.status,
        gas_used: result.transaction.gas_used,
        token_changes: tokenChanges,
        balance_changes: txInfo.balance_changes,
        balance_diff: balanceDiffs,
        base_token_balances: baseTokenBalances
    };
}