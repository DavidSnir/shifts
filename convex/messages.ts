import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Test query - works without authentication
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").collect();
  },
});

// Test mutation - works without authentication
export const send = mutation({
  args: { body: v.string(), author: v.string() },
  handler: async (ctx, { body, author }) => {
    const message = { body, author };
    await ctx.db.insert("messages", message);
  },
});

// Authenticated query - requires authentication and shows only user's messages
export const listAuthenticated = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    return await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("author"), identity.email || identity.name || "Unknown User"))
      .collect();
  },
});

// Authenticated mutation - requires authentication and uses user's identity
export const sendAuthenticated = mutation({
  args: { body: v.string() },
  handler: async (ctx, { body }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    
    const message = { 
      body, 
      author: identity.email || identity.name || "Authenticated User"
    };
    await ctx.db.insert("messages", message);
  },
}); 