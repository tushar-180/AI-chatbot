import { Router } from "express";
import { GroupChatController } from "../controllers/groupChat.controller";

const router = Router();


router.post("/create", GroupChatController.createGroup);
router.get("/check",(req, res) => {
  res.json({ message: "Group chat route is working!" });
});
router.get("/user-groups", GroupChatController.getUserGroups);
router.get("/invite/:inviteCode", GroupChatController.getGroupByInviteCode);
router.post("/join/:inviteCode", GroupChatController.joinGroup);
router.get("/:groupId/messages", GroupChatController.getGroupDetails);
router.post("/:groupId/message", GroupChatController.sendMessage);
router.get("/:groupId/events", GroupChatController.subscribeToGroup);
router.post("/:groupId/leave", GroupChatController.leaveGroup);

export { router as groupChatRoutes };
