import { Router } from "express";
import { GroupChatController } from "../controllers/groupChat.controller";

const router = Router();

router.post("/create", GroupChatController.createGroup);
router.get("/check", (req, res) => {
  res.json({ message: "Group chat route is working!" });
});
router.get("/user-groups", GroupChatController.getUserGroups);
router.get("/user-created", GroupChatController.getUserCreatedGroups);
router.get("/invite/:inviteCode", GroupChatController.getGroupByInviteCode);
router.post("/join/:inviteCode", GroupChatController.joinGroup);
router.get("/:groupId/messages", GroupChatController.getGroupDetails);
router.post("/:groupId/message", GroupChatController.sendMessage);
router.post("/:groupId/stop", GroupChatController.stopStream);
router.post("/:groupId/leave", GroupChatController.leaveGroup);
router.post("/:groupId/remove-member", GroupChatController.removeMember);
router.delete("/:groupId", GroupChatController.deleteGroup);
router.patch("/:groupId", GroupChatController.updateGroupTitle);
router.post("/:groupId/pin", GroupChatController.pinGroup);
router.post("/:groupId/unpin", GroupChatController.unpinGroup);

export { router as groupChatRoutes };
