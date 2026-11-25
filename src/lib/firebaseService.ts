import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  increment,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase';
import { Post, Comment, Conversation, Message, UserProfile } from '../types';

// Real-time listener for Posts
export function subscribePosts(onUpdate: (posts: Post[]) => void) {
  if (!isFirebaseConfigured || !db) return () => {};

  const postsCollection = collection(db, 'posts');
  
  return onSnapshot(
    postsCollection,
    async (snapshot) => {
      try {
        const postsList: Post[] = [];
        for (const document of snapshot.docs) {
          const data = document.data();
          
          // Fetch sub-collection 'comments' for each post to populate Comments array
          const commentsCol = collection(db, 'posts', document.id, 'comments');
          const commentsSnap = await getDocs(commentsCol);
          const commentsList: Comment[] = commentsSnap.docs.map(cDoc => ({
            id: cDoc.id,
            ...cDoc.data()
          } as Comment));

          postsList.push({
            id: document.id,
            authorName: data.authorName || '',
            authorAvatar: data.authorAvatar || '',
            date: data.date || '',
            category: data.category || 'adoção',
            title: data.title || '',
            petName: data.petName || '',
            description: data.description || '',
            location: data.location || '',
            phone: data.phone || '',
            likes: data.likes || 0,
            likedByMe: data.likedByMe || false,
            imageUrl: data.imageUrl || '',
            comments: commentsList
          });
        }
        onUpdate(postsList);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'posts');
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'posts');
    }
  );
}

// Create a new post in Firebase
export async function createPostInFirebase(post: Omit<Post, 'id' | 'comments' | 'likedByMe'>): Promise<string> {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }

  try {
    const postsCollection = collection(db, 'posts');
    const docRef = await addDoc(postsCollection, {
      authorName: post.authorName,
      authorAvatar: post.authorAvatar,
      date: post.date,
      category: post.category,
      title: post.title,
      petName: post.petName,
      description: post.description,
      location: post.location,
      phone: post.phone,
      likes: post.likes,
      likedByMe: false,
      imageUrl: post.imageUrl,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'posts');
    return '';
  }
}

// Like/Unlike post in Firebase
export async function toggleLikeInFirebase(postId: string, isLiked: boolean) {
  if (!isFirebaseConfigured || !db) return;

  try {
    const postDoc = doc(db, 'posts', postId);
    await updateDoc(postDoc, {
      likes: increment(isLiked ? 1 : -1)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

// Add a comment to a Post in Firebase
export async function addCommentInFirebase(postId: string, comment: Omit<Comment, 'id'>) {
  if (!isFirebaseConfigured || !db) return;

  try {
    const commentsCol = collection(db, 'posts', postId, 'comments');
    await addDoc(commentsCol, {
      authorName: comment.authorName,
      authorAvatar: comment.authorAvatar,
      text: comment.text,
      date: comment.date,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${postId}/comments`);
  }
}

// Delete a Post
export async function deletePostFromFirebase(postId: string) {
  if (!isFirebaseConfigured || !db) return;

  try {
    const postDoc = doc(db, 'posts', postId);
    await deleteDoc(postDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
  }
}

// Real-time listener for Conversations
export function subscribeConversations(onUpdate: (conversations: Conversation[]) => void) {
  if (!isFirebaseConfigured || !db) return () => {};

  const conversationsCol = collection(db, 'conversations');
  
  return onSnapshot(
    conversationsCol,
    async (snapshot) => {
      try {
        const conversationsList: Conversation[] = [];
        for (const document of snapshot.docs) {
          const data = document.data();
          
          // Fetch messages subcollection
          const messagesCol = collection(db, 'conversations', document.id, 'messages');
          const messagesSnap = await getDocs(messagesCol);
          const messagesList: Message[] = messagesSnap.docs.map(mDoc => ({
            id: mDoc.id,
            ...mDoc.data()
          } as Message));

          conversationsList.push({
            id: document.id,
            title: data.title || '',
            category: data.category || 'adoção',
            lastMessage: data.lastMessage || '',
            date: data.date || '',
            messages: messagesList
          });
        }
        onUpdate(conversationsList);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'conversations');
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'conversations');
    }
  );
}

// Create a new Conversation in Firebase
export async function createConversationInFirebase(conv: Omit<Conversation, 'id' | 'messages'>): Promise<string> {
  if (!isFirebaseConfigured || !db) return '';

  try {
    const conversationsCol = collection(db, 'conversations');
    const docRef = await addDoc(conversationsCol, {
      title: conv.title,
      category: conv.category,
      lastMessage: conv.lastMessage,
      date: conv.date,
      participants: [auth?.currentUser?.email || 'user@example.com'],
      createdAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'conversations');
    return '';
  }
}

// Add a Message to a Conversation in Firebase
export async function addMessageInFirebase(conversationId: string, msg: Omit<Message, 'id'>) {
  if (!isFirebaseConfigured || !db) return;

  try {
    const messagesCol = collection(db, 'conversations', conversationId, 'messages');
    await addDoc(messagesCol, {
      sender: msg.sender,
      text: msg.text,
      timestamp: msg.timestamp,
      createdAt: Timestamp.now()
    });

    // Update the last message in the parent conversation
    const convDoc = doc(db, 'conversations', conversationId);
    await updateDoc(convDoc, {
      lastMessage: msg.text,
      date: 'Agora'
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${conversationId}/messages`);
  }
}
