// Strautomator Core: Chatbase

import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {AxiosResponse} from "axios"
import {Response} from "express"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Chatbase AI chat bot service.
 */
export class Chatbase {
    private constructor() {}
    private static _instance: Chatbase
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Chatbase wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.chatbase.api.key) {
                throw new Error("Missing the chatbase.api.key setting")
            }
        } catch (ex) {
            logger.error("Chatbase.init", ex)
        }
    }

    /**
     * Make a request to Chatbase.
     * @param method HTTP method.
     * @param path URL path.
     * @param body Optional request body.
     * @param stream Whether to stream the response back to the client (used when passing a server response).
     */
    private makeRequest = async (method: "GET" | "POST", path: string, body?: any, stream?: boolean): Promise<AxiosResponse | any> => {
        const options: AxiosConfig = {
            method: method,
            url: `${settings.chatbase.api.baseUrl}${path}`,
            headers: {Authorization: `Bearer ${settings.chatbase.api.key}`},
            responseType: stream ? "stream" : "json",
            returnResponse: stream ? true : false
        }

        if (body) {
            options.data = body
        }

        try {
            const result = await axiosRequest(options)
            return result
        } catch (ex) {
            logger.debug("Chatbase.makeRequest", method, path, body, ex)
            throw ex
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Asks something to the chat bot and return the answer.
     * @param user User asking something.
     * @param message The message from the user.
     * @param res Optional server response used when streaming the answer back to the client.
     */
    getAnswer = async (user: UserData, message: string, res?: Response): Promise<void | string> => {
        try {
            const body = {
                chatbotId: settings.chatbase.chatbotId,
                messages: [{role: "user", content: message}],
                stream: res ? true : false
            }

            const result = await this.makeRequest("POST", "chat", body, body.stream)
            let answer = ""

            // If a response object was passed, stream the answer back to the client as it arrives.
            if (res) {
                const decoder = new TextDecoder()

                result.data.on("data", (chunk) => {
                    const chunkValue = decoder.decode(chunk)
                    answer += chunkValue
                    res.write(chunkValue)
                })
                result.data.on("end", () => {
                    res.end()
                    logger.info("Chatbase.getAnswer", user ? logHelper.user(user) : "anonymous", message, answer || "no answer", "Streamed")
                })

                return
            }

            // Traditional request instead, returns the full answer.
            answer = result?.text || null
            logger.info("Chatbase.getAnswer", user ? logHelper.user(user) : "anonymous", message, answer || "No answer")

            return answer
        } catch (ex) {
            logger.error("Chatbase.getAnswer", user ? logHelper.user(user) : "anonymous", logHelper.user(user), message, ex)
            throw ex
        }
    }
}

// Exports...
export default Chatbase.Instance
