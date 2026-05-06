"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const User_model_1 = require("../models/User.model");
exports.userService = {
    syncUser(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const { clerkId } = data, rest = __rest(data, ["clerkId"]);
            // Upsert user: update if exists, create if not
            const user = yield User_model_1.User.findOneAndUpdate({ clerkId }, Object.assign(Object.assign({ clerkId }, rest), { lastSignInAt: new Date() }), { upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
            return user;
        });
    },
    getUserByClerkId(clerkId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield User_model_1.User.findOne({ clerkId });
        });
    }
};
