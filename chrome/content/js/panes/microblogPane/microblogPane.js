/*
 Microblog pane
 Charles McKenzie <charles2@mit.edu>
*/

//ISO 8601 DATE

Date.prototype.getISOdate = function (){
    var padZero = function(n){
        return (n<10)? "0"+n: n;
    };
    var ISOdate = this.getUTCFullYear()+"-"+
        padZero (this.getUTCMonth())+"-"+
        padZero (this.getUTCDate())+"T"+
        padZero (this.getUTCHours())+":"+
        padZero (this.getUTCMinutes())+":"+
        padZero (this.getUTCSeconds())+"Z";
    return ISOdate;
};

Date.prototype.parseISOdate= function(dateString){
    var arrDateTime = dateString.split("T");
    var theDate = arrDateTime[0].split("-");
    var theTime = arrDateTime[1].replace("Z","").split(":");
    
    this.setUTCDate(1);
    this.setUTCFullYear(theDate[0]);  
    this.setUTCMonth(theDate[1]);  
    this.setUTCDate(theDate[2]);  
    this.setUTCHours(theTime[0]);  
    this.setUTCMinutes(theTime[1]);  
    this.setUTCSeconds(theTime[2]);
    
    return this;
    
};

sparql.prototype.batch_delete_statement= function(st, callback){
    var query = this._context_where(this._statement_context(st[0]));
    for (var i=0; i < st.length; i++){
        query += "DELETE { " + anonymizeNT(st[i]) + " }\n";
    }
    this._fire(st[0].why.uri, query, callback);
};


tabulator.panes.register (tabulator.panes.microblogPane ={

    icon: Icon.src.icon_mb,
    
    name: 'microblogPane',
    
    label: function(subject) {
        var SIOCt = RDFNamespace('http://rdfs.org/sioc/types#');
        if (tabulator.kb.whether(subject, tabulator.ns.rdf( 'type'), tabulator.ns.foaf('Person'))) {
            return "Microblog";
        } else {
            return null;
        }
    },

    render: function(s, doc) {
        var SIOC = RDFNamespace("http://rdfs.org/sioc/ns#");
        var SIOCt = RDFNamespace('http://rdfs.org/sioc/types#');
        var RSS = RDFNamespace("http://purl.org/rss/1.0/");
        var FOAF = RDFNamespace('http://xmlns.com/foaf/0.1/');
        var terms = RDFNamespace("http://purl.org/dc/terms/");
        var RDF = tabulator.ns.rdf;
        var kb = tabulator.kb;
        var charCount = 140;
        var sparqlUpdater= new sparql(kb);
        
        var getHoldsAccountFromPrefs = function(){
        //attempt to fetch user account from local preferences if just 
        //in case the user's foaf was not writable. add it to the store
        //this will probably need to change. 
            var the_user = tabulator.preferences.get("me");
            if (the_user){
                var the_account =tabulator.preferences.get('acct');
                if (the_user ===''){
                    tabulator.preferences.set('acct', '');
                }else if (the_account && the_account !== ''){
                    the_user = kb.sym(the_user);
                    the_account = kb.sym(tabulator.preferences.get('acct'));
                }
                if (the_user && the_account && the_account !== ''){
                    kb.add(the_user, FOAF('holdsAccount'), the_account, the_user.uri.split("#")[0]);
                }
            }
        };
         
        var FollowList = function(user){        
         /*
            FOLLOW LIST
            store the uri's of followed users for dereferencing the @replies
        */
            this.userlist = {};
            this.uris = {};
            var myFollows = kb.each(kb.sym(user),SIOC('follows'));
            for( var mf in myFollows){
                this.add(kb.any(myFollows[mf],SIOC('id')),myFollows[mf].uri);
            }
        };
            FollowList.prototype.add = function(user,uri){
                if (this.userlist[user]){
                    if (!(uri in this.uris)){
                        this.userlist[user].push(uri);
                        this.uris[uri] = "";
                    }
                }else{
                    this.userlist[user] = [uri];
                }
            };
            FollowList.prototype.selectUser= function(user){
                if (this.userlist[user]){
                    if (this.userlist[user].length == 1){
                        //user follows only one user with nick
                        return [true, this.userlist[user]];
                    }else if (this.userlist[user].length > 1){
                        //user follows multiple users with this nick.
                        return [false, this.userlist[user]];
                    }
                }else{
                    //user does not follow any users with this nick
                    return [false, []] ;
                }
            };
        
        var FavoritesList = function(user){
            /*Favorites 
                controls the list of favorites. constructor expects a user as uri.*/
                
            this.favorites = {};
            this.favoritesURI ="";
            if (!user){
                return;
            }
            this.user = user.split("#")[0];
            created = kb.each (kb.sym(user), SIOC('creator_of'));
            for ( var c in created ){
                if (kb.whether(created[c], RDF('type'), SIOCt('FavouriteThings'))){
                    this.favoritesURI = created[c];
                    var favs = kb.each(created[c], SIOC('container_of'));
                    for (var f in favs){
                        this.favorites[favs[f]]="";
                    }
                    break;
                }
            }
        };
            FavoritesList.prototype.favorited =  function( post ){
            /*Favorited- returns true if the post is a favorite
                false otherwise*/
                return (kb.sym(post) in this.favorites);
            };
            FavoritesList.prototype.add= function(post, callback){
                var batch = new RDFStatement(this.favoritesURI, SIOC('container_of'), kb.sym(post), kb.sym(this.user));
                sparqlUpdater.insert_statement(batch, function(a, success,c){
                    if (success){
                        kb.add(batch.subject, batch.predicate, batch.object, batch.why);
                    }
                    callback(a,success,c);
                });
            };
            FavoritesList.prototype.remove= function(post,callback){
                var batch = new RDFStatement(this.favoritesURI, SIOC('container_of'), kb.sym(post), kb.sym(this.user));
                sparqlUpdater.delete_statement(batch,  function(a, success,c){
                    if (success){
                        kb.add(batch.subject, batch.predicate, batch.object, batch.why);
                    }
                    callback(a,success,c);
                });
            };
        
        getHoldsAccountFromPrefs();
        var gen_random_uri = function(base){
            //generate random uri
            var uri_nonce = base + "#n"+Math.floor(Math.random()*10e+9);
            return kb.sym(uri_nonce);
        };
        var statusUpdate = function(statusMsg, callback, replyTo, meta){
            var myUserURI = getMyURI();
            myUser = kb.sym(myUserURI.split("#")[0]);
            var newPost = gen_random_uri(myUser.uri);
            var microlist = kb.each(kb.sym(myUserURI), SIOC('creator_of'));
            var micro;
            for (var microlistelement in microlist){
                if(kb.whether(microlist[microlistelement], RDF('type'),SIOCt('Microblog')) &&
                    !kb.whether(microlist[microlistelement], SIOC('topic'), kb.sym(getMyURI()))){
                        micro = microlist[microlistelement];
                        break;
                    }
            }
            
            //generate new post 
           var batch =[
                new RDFStatement(newPost, RDF('type'),SIOCt('MicroblogPost'),myUser),
                new RDFStatement(newPost, SIOC('has_creator'),kb.sym(myUserURI),myUser),
                new RDFStatement(newPost, SIOC('content'),statusMsg,myUser),
                new RDFStatement(newPost, terms('created'), String(new Date().getISOdate()),myUser),
                new RDFStatement(micro,SIOC('container_of'),newPost,myUser)
            ];
            
            // message replies
            if (replyTo){
                batch.push(new RDFStatement(newPost, SIOC('reply_of'), kb.sym(replyTo),myUser));
            }
            
            // @replies, #hashtags, !groupReplies
            for (var r in meta.recipients){
                batch.push(new RDFStatement(newPost, SIOC('topic'),kb.sym(meta.recipients[r]),myUser));
                batch.push(new RDFStatement(kb.any(), SIOC("container_of"), newPost, myUser));
                var mblogs = kb.each(kb.sym(meta.recipients[r]),SIOC('creator_of'));
                for (var mb in mblogs){
                    if (kb.whether(mblogs[mb], SIOC('topic'), kb.sym(meta.recipients[r]))){
                        var replyBatch = new RDFStatement(
                            mblogs[mb],
                            SIOC("container_of"),
                            newPost,
                            kb.sym(meta.recipients[r].split('#')[0]));
                        sparqlUpdater.insert_statement(replyBatch);                     }
                }
            }
                
            sparqlUpdater.insert_statement(batch, function(a,b,c) {
                callback(a,b,c, batch);
            });
        };    
        var notify = function(messageString){
            var xmsg = doc.createElement('li');
            xmsg.className ="notify";
            xmsg.innerHTML = messageString;
            doc.getElementById("notify-container").appendChild(xmsg);
            setTimeout(function(){
                doc.getElementById('notify-container').removeChild(xmsg); delete xmsg;
            }, 4000);
        };      
        var getMyURI = function(){
            var me =  tabulator.preferences.get('me');
            var myMicroblog = kb.any(kb.sym(me), FOAF('holdsAccount'));
            return (myMicroblog) ? myMicroblog.uri: false;
        };        
        var favorites = new FavoritesList(getMyURI());
        var followlist = new FollowList(getMyURI());
        var Ifollow = kb.whether(kb.sym(getMyURI()),SIOC('follows'),
            kb.any(s,FOAF('holdsAccount')));//TODO - make this safe for mult accounts.
        var thisIsMe;
        var resourceType = kb.any(s, RDF('type'));
        if (resourceType.uri == SIOCt('Microblog').uri || resourceType.uri == SIOCt('MicroblogPost').uri){ 
            thisIsMe = ( kb.any(s, SIOC( 'has_creator' ) ).uri == getMyURI());
        } else if( resourceType.uri == SIOC('User').uri ){
            thisIsMe = ( s.uri == getMyURI() );
        } else if ( resourceType.uri == FOAF('Person').uri ){
            thisIsMe = (s.uri == tabulator.preferences.get('me'));
        } else {
            thisIsMe = false;
        }

        // EVENT LISTENERS
        var mbGenerateNewMB = function(id, name, avatar, loc){
            var host =  loc + "/"+ id;
            
            var rememberMicroblog= function(){
                tabulator.preferences.set( "acct", host+"#"+id );
            };
            var cbgenUserMB = function(a,success,c,d){
                if (success){
                    notify('Microblog generated at '+host+'#'+id);
                    mbCancelNewMB();
                    //assume the foaf is not writable and store the microblog to the
                    //preferences for later retrieval.
                    //this will probably need to change. 
                    rememberMicroblog();
                    for (var triple in d){
                        kb.add(d[triple].subject, d[triple].predicate, d[triple].object, d[triple].why);
                    }
                }
            };
            
            var genUserMB = [
                //user
                new RDFStatement(kb.sym(host+"#"+id), RDF('type'), SIOC('User'), kb.sym(host)),
                new RDFStatement(kb.sym(host+"#"+id), SIOC('creator_of'), kb.sym(host+'#mb'), kb.sym(host)),
                new RDFStatement(kb.sym(host+"#"+id), SIOC('creator_of'), kb.sym(host+'#mbn'), kb.sym(host)),
                new RDFStatement(kb.sym(host+"#"+id), SIOC('creator_of'), kb.sym(host+'#fav'), kb.sym(host)),
                new RDFStatement(kb.sym(host+"#"+id), SIOC('name'), name, kb.sym(host)),
                new RDFStatement(kb.sym(host+"#"+id), SIOC('id'), id, kb.sym(host)),
                new RDFStatement(kb.sym(host+"#"+id), RDF('label'), id, kb.sym(host)),
                new RDFStatement(s, FOAF('holdsAccount'), kb.sym(host+"#"+id), kb.sym(host)),
                //microblog 
                new RDFStatement(kb.sym(host+'#mb'), RDF('type'), SIOCt('Microblog'), kb.sym(host)),
                new RDFStatement(kb.sym(host+'#mb'), SIOC('has_creator'), kb.sym(host+"#"+id), kb.sym(host)),
                //notification microblog
                new RDFStatement(kb.sym(host+'#mbn'), RDF('type'), SIOCt('Microblog'), kb.sym(host)),
                new RDFStatement(kb.sym(host+'#mbn'), SIOC('topic'), kb.sym(host+"#"+id), kb.sym(host)),
                new RDFStatement(kb.sym(host+'#mbn'), SIOC('has_creator'), kb.sym(host+"#"+id), kb.sym(host)),
                //favorites container
                new RDFStatement(kb.sym(host+'#fav'), RDF('type'), SIOCt('FavouriteThings'), kb.sym(host)),
                new RDFStatement(kb.sym(host+'#fav'), SIOC('has_creator'), kb.sym(host+'#'+id), kb.sym(host))
            ];
            if (avatar){
                //avatar optional
                genUserMB.push(new RDFStatement(kb.sym(host+"#"+id), SIOC('avatar'), kb.sym(avatar), kb.sym(host)));
            }
            sparqlUpdater.insert_statement(genUserMB,cbgenUserMB);
            
        };
        var mbCancelNewMB = function(evt){
            xupdateContainer.removeChild(xupdateContainer.childNodes[xupdateContainer.childNodes.length-1]);
            xcreateNewMB.disabled = false;
        };
        var lsCreateNewMB = function(evt){
            //disable the create new microblog button.
            //then prefills the information.
            xcreateNewMB.disabled= true;
            var xcmb = doc.createElement('div');
            var xcmbName = doc.createElement('input');
                if(kb.whether(s,FOAF('name'))){  //handle use of FOAF:NAME
                    xcmbName.value = kb.any(s,FOAF('name'));
                }else{ //handle use of family and given name
                    xcmbName.value = (kb.any(s,FOAF('givenname')))? 
                        kb.any(s,FOAF('givenname'))+ " " : "";
                    xcmbName.value += (kb.any(s,FOAF("family_name")))?
                        kb.any(s,FOAF('givenname')) : "";
                    xcmbName.value = kb.any(s,FOAF('givenname')) + " "+
                        kb.any(s,FOAF("family_name"));
                }
            var xcmbId = doc.createElement('input');
                xcmbId.value  = (kb.any(s, FOAF('nick')))? kb.any(s, FOAF('nick')) : "";
            var xcmbAvatar = doc.createElement('input');
                if(kb.whether(s,FOAF('img'))){ // handle use of img
                    xcmbAvatar.value = kb.any(s,FOAF('img')).uri;
                }else{ //otherwise try depiction
                    xcmbAvatar.value = (kb.any(s,FOAF('depiction')))?
                        kb.any(s,FOAF('depiction')).uri : "";
                }
            var workspace; //= kb.any(s,WORKSPACE) //TODO - ADD URI FOR WORKSPACE DEFINITION
            var xcmbWritable = doc.createElement("input");
                xcmbWritable.value = (workspace)? workspace :"http://dig.csail.mit.edu/2007/wiki/sandbox";
                xcmb.innerHTML = '\
                    <form class ="createNewMB" id="createNewMB">\
                        <p id="xcmbname"><span class="">Name: </span></p>\
                        <p id="xcmbid">Id: </p>\
                        <p id="xcmbavatar">Avatar: </p> \
                        <p id="xcmbwritable">Host my microblog at: </p>\
                        <input type="button" id="mbCancel" value="Cancel" />\
                        <input type="submit" id="mbCreate" value="Create\!" />\
                    </form>\
                    ';
            xupdateContainer.appendChild(xcmb);
            doc.getElementById("xcmbname").appendChild(xcmbName); 
            doc.getElementById("xcmbid").appendChild(xcmbId);
            doc.getElementById("xcmbavatar").appendChild(xcmbAvatar);
            doc.getElementById("xcmbwritable").appendChild(xcmbWritable);
            doc.getElementById("mbCancel").addEventListener("click", mbCancelNewMB, false);
            doc.getElementById("createNewMB").addEventListener("submit",function(){
                mbGenerateNewMB(xcmbId.value, xcmbName.value, xcmbAvatar.value, xcmbWritable.value);
            }, false);
            xcmbName.focus();
        };
        var mbSubmitPost = function(){
            var postDate = new Date();
            var meta ={
                recipients:[]
            };
            //user has selected a microblog to post to
            if(getMyURI()){
                myUser = kb.sym(getMyURI());
                //submission callback
                var cbconfirmSubmit = function(uri, success, responseText,d){
                    if(success === true){
                        for (var triple in d){
                            kb.add(d[triple].subject, d[triple].predicate, d[triple].object, d[triple].why);
                        }
                        xupdateSubmit.disabled = false;
                        xupdateStatus.value="";
                        mbLetterCount();
                        notify("Microblog Updated.");
                        if (thisIsMe){
                            doc.getElementById('postNotificationList').insertBefore( generatePost(d[0].subject,thisIsMe), doc.getElementById('postNotificationList').childNodes[0]);
                        } 
                    } else {
                        notify("There was a problem submitting your post.");
                    }
                };
                var words = xupdateStatus.value.split(" ");
                var mbUpdateWithReplies= function(){
                    xupdateSubmit.disabled = true;
                    xupdateSubmit.value = "Updating...";
                    statusUpdate(xupdateStatus.value,cbconfirmSubmit,xinReplyToContainer.value,meta);
                };
                for (var word in words){
                    if (words[word].match(/\@\w+/)){
                        var atUser = words[word].replace(/\W/g,"");
                        var recipient = followlist.selectUser(atUser);
                        if (recipient[0] ===true){
                            meta.recipients.push(recipient[1][0]);
                        }else if (recipient[1].length > 1) { // if  multiple users allow the user to choose
                            var xrecipients = doc.createElement( 'select' );
                            var xrecipientsSubmit = doc.createElement( 'input' );
                                xrecipientsSubmit.type = "button";
                                xrecipientsSubmit.value = "Continue";
                                xrecipientsSubmit.addEventListener( "click", function(){
                                    meta.recipients.push(recipient[1][xrecipients.value]);
                                    mbUpdateWithReplies();
                                    xrecipients.parentNode.removeChild(xrecipientsSubmit);
                                    xrecipients.parentNode.removeChild(xrecipients);
                                }, false );
                            var recipChoice =  function( recip, c ){
                                var name = kb.any( kb.sym( recip ), SIOC('name'));
                                var choice = doc.createElement( 'option' );
                                    choice.value = c;
                                    choice.innerHTML = name;
                                return choice;
                            };
                            for ( var r in recipient[1] ){
                                xrecipients.appendChild( recipChoice( recipient[1][r], r ) );
                            }
                            xupdateContainer.appendChild( xrecipients );
                            xupdateContainer.appendChild( xrecipientsSubmit );
                            return;
                        }else{ //no users known or self reference.
                            if (String(kb.any(kb.sym(getMyURI()), SIOC("id"))).toLowerCase() == atUser.toLowerCase()){
                                meta.recipients.push(getMyURI());
                            } else{
                                notify("You do not follow "+atUser+". Try following "+atUser+" before mentioning them.");
                                return;
                            }
                        }
                    }/* else if(words[word].match(/\#\w+/)){
                        //hashtag
                    } else if(words[word].match(/\!\w+/)){
                        //usergroup 
                    }*/
                }
                mbUpdateWithReplies();
            }else{
                notify("Please set your microblog first.");
            }
        };
        var mbSetMyMB =  function(){
            setMyURI();
            xfollowButton.style.display = 'none';
            xsetMyMB.style.display = 'none';
        };
        var mbLetterCount = function(){
            xupdateStatusCounter.innerHTML = charCount - xupdateStatus.value.length;
            xupdateStatusCounter.style.color= (charCount - xupdateStatus.value.length < 0)? "#c33":"";
            if (xupdateStatus.value.length === 0){
                xinReplyToContainer.value = "";
                xupdateSubmit.value = "Send";
            }
        };
        var mbFollowUser = function (){
            var myUser = kb.sym(getMyURI());
            var mbconfirmFollow = function(uri,stat,msg){
                if (stat === true){
                    if (!Ifollow){
                        //prevent duplicate entries from being added to kb (because that was happening)
                        if (!kb.whether(followMe.subject, followMe.predicate, followMe.object, followMe.why)){
                            kb.add(followMe.subject, followMe.predicate, followMe.object, followMe.why);
                        }
                    }else{
                        kb.removeMany(followMe.subject, followMe.predicate, followMe.object, followMe.why);
                    }
                    Ifollow= !Ifollow;
                    xfollowButton.disabled = false;
                    followButtonLabel = (Ifollow)? "Unfollow ":"Follow ";
                    var doFollow = (Ifollow)? "now follow ":"no longer follow ";
                    xfollowButton.value = followButtonLabel+ username;
                    notify("You "+doFollow+username+".");
                }
            };
            followMe = new RDFStatement(myUser,SIOC('follows'),creator,myUser);
            xfollowButton.disabled= true;
            xfollowButton.value = "Updating...";
            if (!Ifollow){
                sparqlUpdater.insert_statement(followMe, mbconfirmFollow);
            }else {
                sparqlUpdater.delete_statement(followMe, mbconfirmFollow);
            }
        };
        
        //reply viewer
        var xviewReply = doc.createElement('ul');
            xviewReply.className = "replyView";
            xviewReply.addEventListener("click", function(){
                xviewReply.className = "replyView";
            },false);

        //HEADER
        var headerContainer = doc.createElement('div');
            headerContainer.className ="header-container";

        //---create status update box---
        var xnotify = doc.createElement('ul');
            xnotify.id ="notify-container";
            xnotify.className = "notify-container";
        var xupdateContainer = doc.createElement('form');
            xupdateContainer.className="update-container";
            xupdateContainer.innerHTML ="<h3>What are you up to?</h3>";
        if (getMyURI()){
            var xinReplyToContainer = doc.createElement('input');
                xinReplyToContainer.type="hidden";
            
            var xupdateStatus = doc.createElement('textarea');
            
            var xupdateStatusCounter = doc.createElement('span');
                xupdateStatusCounter.appendChild(doc.createTextNode(charCount));
                xupdateStatus.cols= 30;
                
            var xupdateSubmit = doc.createElement('input');
                xupdateSubmit.type = "submit";
                xupdateSubmit.value = "Send";
                
            xupdateContainer.appendChild (xinReplyToContainer);
            xupdateContainer.appendChild(xupdateStatusCounter);
            xupdateContainer.appendChild(xupdateStatus);
            xupdateContainer.appendChild(xupdateSubmit);
            xupdateContainer.addEventListener('submit',mbSubmitPost,false);
            xupdateStatus.addEventListener('keyup',mbLetterCount,false);
        } else {
            var xnewUser = doc.createTextNode("\
                Hi, it looks like you don't have a microblog,\
                would you like to create one? ");
            var xcreateNewMB = doc.createElement("input");
                xcreateNewMB.type = "button";
                xcreateNewMB.value ="Create a new Microblog";
                xcreateNewMB.addEventListener("click", lsCreateNewMB, false);
            xupdateContainer.appendChild(xnewUser);
            xupdateContainer.appendChild(xcreateNewMB);
        }
        
        headerContainer.appendChild(xupdateContainer);
        
        var subheaderContainer = doc.createElement('div');
        subheaderContainer.className ="subheader-container";
        
        
        //user header
        var creator;
        var creators = kb.each(s, FOAF('holdsAccount'));
        for (var c in creators){
            if (kb.whether(creators[c], RDF('type'), SIOC('User')) &&
                kb.whether(kb.any(creators[c], SIOC('creator_of')), RDF('type'),SIOCt('Microblog'))){
                creator = creators[c];
                var mb = kb.sym(creator.uri.split("#")[0]);
                //tabulator.sf.refresh(mb);
                break;
                //TODO add support for more than one microblog in same foaf
            }
        }
        if (creator){
            //---display avatar, if available ---
            var mb_avatar = (kb.any(creator,SIOC("avatar"))) ? kb.any(creator,SIOC("avatar")): "";
            if (mb_avatar !==""){
                var avatar = doc.createElement('img');
                    avatar.src = mb_avatar.uri;
                subheaderContainer.appendChild(avatar);
            }           
            //---generate name ---
            var userName = doc.createElement('h1');
            userName.className = "fn";
            var username = kb.any(creator,SIOC("name"));
            var uid = kb.any(creator,SIOC("id"));
            userName.appendChild(doc.createTextNode(username+" ("+uid+")"));
            subheaderContainer.appendChild(userName);
            //---display follow button---
            if (!thisIsMe && getMyURI()){
                var xfollowButton = doc.createElement('input');
                    xfollowButton.setAttribute("type", "button");
                    followButtonLabel = (Ifollow)? "Unfollow ":"Follow ";
                    xfollowButton.value = followButtonLabel+ username;
                    xfollowButton.addEventListener('click', mbFollowUser, false);
                subheaderContainer.appendChild(xfollowButton);
            }
            //user header end
            //header tabs
            var mbChangeTab = function(evt){ 
                //hide active panes
                postNotificationContainer.className= postNotificationContainer.className.replace(/\w*active\w*/,"");
                postMentionContainer.className= postNotificationContainer.className.replace(/\w*active\w*/,"");
                postContainer.className= postContainer.className.replace(/\w*active\w*/,"");
                xfollows.className = xfollows.className.replace(/\w*active\w*/,"");
                //clear active tabs
                xstreamTab.className=xstreamTab.className.replace(/\w*active\w*/,"");
                xuserPostTab.className=xuserPostTab.className.replace(/\w*active\w*/,"");
                xuserMentionsTab.className= xuserMentionsTab.className.replace(/\w*active\w*/,"");
                xfollowsTab.className=xfollowsTab.className.replace(/\w*active\w*/,"");
                switch (evt.target.id){
                    case "tab-stream":
                        postContainer.className+=" active";
                        xstreamTab.className ="active";
                    break;
                    case "tab-by-user":
                        postNotificationContainer.className+=" active";
                        xuserPostTab.className ="active";
                    break;
                    case "tab-at-user":
                        postMentionContainer.className+=" active";
                        xuserMentionsTab.className ="active";
                    break;
                    case "tab-follows":
                        xfollows.className+=" active";
                        xfollowsTab.className ="active";
                    break;
                    default:
                    break;
                }
            };
            var xtabsList = doc.createElement('ul');
                xtabsList.className = "tabslist";

            var xstreamTab = doc.createElement('li');
                xstreamTab.innerHTML = "By follows";
                xstreamTab.className = "active";
                xstreamTab.id = "tab-stream";
                xstreamTab.addEventListener("click", mbChangeTab, false);
                xtabsList.appendChild(xstreamTab);
        
            var xuserPostTab = doc.createElement('li');
                xuserPostTab.innerHTML = "By "+uid;
                xuserPostTab.id = "tab-by-user";
                xuserPostTab.addEventListener("click", mbChangeTab, false);
                xtabsList.appendChild(xuserPostTab);
        
            var xuserMentionsTab = doc.createElement('li');
                xuserMentionsTab.innerHTML = "@"+uid;
                xuserMentionsTab.id = "tab-at-user";
                xuserMentionsTab.addEventListener("click", mbChangeTab, false);
                xtabsList.appendChild(xuserMentionsTab);
        
            var xfollowsTab = doc.createElement('li');
                xfollowsTab.innerHTML = uid+"'s follows";
                xfollowsTab.id= "tab-follows";
                xfollowsTab.addEventListener("click", mbChangeTab, false);
                xtabsList.appendChild(xfollowsTab);  
            //header tabs end
            headerContainer.appendChild(subheaderContainer);
            headerContainer.appendChild(xtabsList);
        }

        //HEADER END   
        
       //FOLLOWS VIEW
        var getFollowed = function(user){
            var userid = kb.any(user, SIOC('id'));
            var follow = doc.createElement('li');
            follow.className = "follow";
            userid = (userid)? userid : user.uri ;
            var fol=kb.any(undefined,FOAF('holdsAccount'),user);
                fol = (fol)? fol.uri:user.uri;
           follow.innerHTML = "<a href=\""+fol+"\">"+
               userid+"</a>";
           return follow;
        };
        var xfollows = doc.createElement('div');
            xfollows.className = "followlist-container view-container";
        if (kb.whether(creator, SIOC('follows'))){
            var creatorFollows = kb.each(creator, SIOC('follows'));
            var xfollowsList = doc.createElement('ul');
            for ( var thisPerson in creatorFollows){
                xfollowsList.appendChild(getFollowed(creatorFollows[thisPerson]));
            }
            xfollows.appendChild(xfollowsList);
        }
        //FOLLOWS VIEW END 
       
        var generatePost = function (post,me){
        /* 
            generatePost - Creates and formats microblog posts 
                post - symbol of the uri the post in question
        */
            var viewPost = function(uris){
                for (var n in xviewReply.childNodes){
                    xviewReply.removeChild(xviewReply.childNodes[0]);
                }
                var xcloseContainer = doc.createElement('li');
                    xcloseContainer.className="closeContainer";
                var xcloseButton= doc.createElement('span');
                    xcloseButton.innerHTML = "&#215;";
                    xcloseButton.className = "closeButton";
                xcloseContainer.appendChild(xcloseButton);
                xviewReply.appendChild(xcloseContainer);
                for (var uri in uris){
                    xviewReply.appendChild(generatePost(kb.sym(uris[uri]), thisIsMe,"view"));
                }
                xviewReply.className = "replyView-active";
                microblogPane.appendChild(xviewReply);
            };
            //container for post
            var xpost = doc.createElement('li');
                xpost.className = "post";
                xpost.setAttribute("id", String(post.uri).split("#")[1]);
            //username text 
            var uname = kb.any(kb.any(post , SIOC('has_creator')),SIOC('id'));
            var uholdsaccount = kb.any(undefined, FOAF('holdsAccount'),kb.any(post , SIOC('has_creator')));
            var xuname = doc.createElement('a');
                xuname.href= uholdsaccount.uri;
                xuname.className = "userLink";
            var xunameText = doc.createTextNode(uname);
            xuname.appendChild (xunameText);
            //user image
            var uavatar = kb.any(kb.any(post , SIOC('has_creator')),SIOC('avatar'));
            var xuavatar = doc.createElement('img');
                xuavatar.src = uavatar.uri;
                xuavatar.className = "postAvatar";
            //post content
            var xpostContent = doc.createElement('blockquote');
            var postText = String(kb.any(post,SIOC("content"))); 
            //post date
            var xpostLink= doc.createElement("a");
                xpostLink.className="postLink";
                xpostLink.addEventListener("click",function(){viewPost([post.uri]);},false);
                xpostLink.id = "post_"+String(post.uri).split("#")[1];
                xpostLink.setAttribute("content",post.uri);
                xpostLink.setAttribute("property","permalink");
            var postLink = new Date();
            postLink = postLink.parseISOdate(String(kb.any(post,terms('created'))));
            var h = postLink.getHours();
            var a = (h>12)?" PM":" AM";
                h = (h>12)?(h-12):h;
            var m = postLink.getMinutes();
                m = (m<10)?"0"+m:m;
            var mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            var da = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
            var ds = da[postLink.getDay()]+" "+postLink.getDate()+" "+mo[postLink.getMonth()]+ " "+postLink.getFullYear();
            postLink = h+":"+m+a+" on "+ds;
            postLink = doc.createTextNode((postLink)?postLink:"post date unknown");
            xpostLink.appendChild(postLink);
            
   
            //LINK META DATA (MENTIONS, HASHTAGS, GROUPS)
            var mentions =kb.each(post,SIOC("topic"));
            tags = new Object();

            for( var mention in mentions){
                sf.lookUpThing(mentions[mention]);
                id = kb.any(mentions[mention], SIOC('id'));
                tags["@"+id] = mentions[mention];
            }
            var postTags = postText.match(/(\@|\#|\!)\w+/g);
            var postFunction = function(){
                p = postTags.pop();
                return (tags[p])? kb.any(undefined, FOAF('holdsAccount'),tags[p]).uri :p;
            };
            for ( var t in tags){
                var person = t.replace(/\@/, "");
                var replacePerson = RegExp("(\@|\!|\#)("+person+")");
                postText = postText.replace(replacePerson, "$1<a href=\""+postFunction()+"\">$2</a>");
            }
            xpostContent.innerHTML = postText;
            
            //in reply to logic
            // This has the potential to support a post that replies to many messages.
            var inReplyTo = kb.each(post,SIOC("reply_of"));
            var xreplyTo = doc.createElement("span");
            for ( var reply in inReplyTo){
                var theReply = new RDFNamespace();
                theReply =String(inReplyTo[reply]).replace(/\<|\>/g,"");
                var genReplyTo = function(){
                    var reply = doc.createElement('a');
                        reply.innerHTML = ", <b>in reply to</b>";
                        reply.addEventListener("click",function(){viewPost([post.uri,theReply]); return false;},false);
                    return reply;
                };
                xreplyTo.appendChild(genReplyTo());

            }

            //END LINK META DATA
            
            //add the reply to and delete buttons to the interface
            var mbReplyTo = function (){
                var id= kb.any(kb.any(post, SIOC('has_creator')),SIOC("id"));
                xupdateStatus.value = "@"+id+" ";
                xupdateStatus.focus();
                xinReplyToContainer.value = post.uri;
                xupdateSubmit.value = "Reply";
                mbLetterCount();
            };
            var mbDeletePost = function (evt){
                var lsconfirmNo= function (){
                    doc.getElementById('notify-container').removeChild(xconfirmDeletionDialog);
                    evt.target.disabled = false;
                };
                var lsconfirmYes= function(){
                    reallyDelete();
                    doc.getElementById('notify-container').removeChild(xconfirmDeletionDialog);
                };
                evt.target.disabled = true;
                var xconfirmDeletionDialog =  doc.createElement('li');
                    xconfirmDeletionDialog.className = "notify conf";
                    xconfirmDeletionDialog.innerHTML +="<p>Are you sure you want to delete this post?</p>";
                    xconfirmDeletionDialog.addEventListener("keyup",function(evt){
                        if(evt.keyCode == 27){
                            lsconfirmNo();
                        }
                    },false);
                var confirmyes = doc.createElement("input");
                    confirmyes.type = "button";
                    confirmyes.className = "confirm";
                    confirmyes.value = "Delete";
                    confirmyes.addEventListener("click",lsconfirmYes, false);
                var confirmno = doc.createElement("input");
                    confirmno.type = "button";
                    confirmno.className = "confirm";
                    confirmno.value = "Cancel";
                    confirmno.addEventListener("click", lsconfirmNo, false);
                xconfirmDeletionDialog.appendChild(confirmno);
                xconfirmDeletionDialog.appendChild(confirmyes);
                doc.getElementById("notify-container").appendChild(xconfirmDeletionDialog);
                confirmno.focus();

                var reallyDelete=function(){
                    //callback after deletion
                    var mbconfirmDeletePost= function(a,success){
                        if (success){
                            notify("Post deleted.");
                            //update the ui to reflect model changes.
                            var deleteThisNode = evt.target.parentNode;
                            deleteThisNode.parentNode.removeChild(deleteThisNode);
                            kb.removeMany(deleteMe);
                        }else{
                            notify("Oops, there was a problem, please try again");
                            evt.target.disabled = true;
                        }
                    };
                    //delete references to post
                    var deleteContainerOf= function(a,success){
                        if (success){
                            var deleteContainer = kb.statementsMatching(
                                undefined,SIOC('container_of'),kb.sym(doc.getElementById(
                                "post_"+evt.target.parentNode.id).getAttribute("content")));
                            sparqlUpdater.batch_delete_statement(deleteContainer, mbconfirmDeletePost);
                        } else{
                            notify("Oops, there was a problem, please try again");
                            evt.target.disabled = false;
                        }
                    };
                    //delete attributes of post
                    evt.target.disabled = true;
                    deleteMe = kb.statementsMatching(kb.sym(doc.getElementById(
                        "post_"+evt.target.parentNode.id).getAttribute("content")));
                    sparqlUpdater.batch_delete_statement(deleteMe, deleteContainerOf);
                };
            };
            
            if (getMyURI()){ //generate buttons if the uri is not set. 
                var themaker = kb.any(post , SIOC('has_creator'));
                if (getMyURI() != themaker.uri){
                    var xreplyButton = doc.createElement('input');
                        xreplyButton.type = "button";
                        xreplyButton.value = "reply";
                        xreplyButton.className = "reply";
                        xreplyButton.addEventListener('click', mbReplyTo, false);   
                }else{
                    var xdeleteButton = doc.createElement('input');
                        xdeleteButton.type = 'button';
                        xdeleteButton.value = "Delete";
                        xdeleteButton.className = "reply";
                        xdeleteButton.addEventListener('click', mbDeletePost, false);
                }
            }

            var mbFavorite = function(evt){
                var nid = evt.target.parentNode.id;
                var favpost = doc.getElementById("post_"+nid).getAttribute("content");
                xfavorite.className+=" ing";
                var cbFavorite = function (a,success,c,d){
                    if (success){
                        xfavorite.className = (xfavorite.className.split(" ")[1]=="ed")? 
                            "favorit": "favorit ed";
                    }
                };
                if (!favorites.favorited(favpost)){
                    favorites.add(favpost,cbFavorite);
                } else {
                    favorites.remove(favpost, cbFavorite);
                }
            };
            var xfavorite = doc.createElement('a');
                xfavorite.innerHTML="&#9733;";
                xfavorite.addEventListener("click", mbFavorite, false);
            if (favorites.favorited(post.uri)){
                xfavorite.className = "favorit ed";
                
            } else {
                xfavorite.className ="favorit";
            }
            //build
            xpost.appendChild(xuavatar);
            xpost.appendChild(xpostContent);
            if(getMyURI()){ 
                xpost.appendChild(xfavorite);
                if (getMyURI() != themaker.uri){xpost.appendChild(xreplyButton);}
                else{xpost.appendChild(xdeleteButton);}
            }
            xpost.appendChild(xuname);
            xpost.appendChild(xpostLink);
            if(inReplyTo !== ""){xpost.appendChild(xreplyTo);}
            return xpost;
        }; 
        var generatePostList = function(gmb_posts){
        /*
            generatePostList - Generate the posts and 
            display their results on the interface.
        */
            var post_list =  doc.createElement('ul');
            var postlist = new Object();
            var datelist = new Array();
            for ( var post in gmb_posts){
                var postDate = kb.any(gmb_posts[post],terms('created'));
                if (postDate){
                    datelist.push(postDate);
                    postlist[postDate] = generatePost(gmb_posts[post],thisIsMe);
                }
            }
            datelist.sort().reverse();
            for (var d in datelist){
                post_list.appendChild (postlist[datelist[d]]);
            }
            return post_list;
        };
        
        // POST INFORMATION
        var postContainer = doc.createElement('div');
        postContainer.className = "post-container view-container active";
        var mb_posts = [];

        //STREAM VIEW
        if (kb.whether(s,FOAF('name')) && kb.whether(s, FOAF('holdsAccount'))){
            sf.lookUpThing(kb.any(s, FOAF('holdsAccount')));
            var follows = kb.each(kb.any(s, FOAF('holdsAccount')), SIOC('follows'));
            for (var f in follows){
                sf.lookUpThing(follows[f]); //look up people user follows
                var smicroblogs = kb.each(follows[f],SIOC('creator_of')); //get the follows microblogs
                for (var smb in smicroblogs){
                    sf.lookUpThing(smicroblogs[smb]);
                    if (kb.whether(smicroblogs[smb], SIOC('topic'), follows[f])){
                        continue;
                    }else{
                        mb_posts = mb_posts.concat(kb.each(smicroblogs[smb], SIOC('container_of')));
                    }
                }
            }
        }
        if (mb_posts.length > 0){
            var postList = generatePostList(mb_posts); //generate stream
                postList.id = "postList";
                postList.className = "postList";
            postContainer.appendChild(postList);
        }
        //END STREAM VIEW
        
        //NOTIFICATIONS VIEW
        var postNotificationContainer = doc.createElement('div');
            postNotificationContainer.className = "notification-container view-container";
        var postMentionContainer = doc.createElement('div');
            postMentionContainer.className = "mention-container view-container";
        var mbn_posts =[];
        var mbm_posts =[];
        //get mbs that I am the creator of.
        var theUser = kb.any(s,FOAF('holdsAccount'));
        var microblogs = kb.each(theUser,SIOC('creator_of'));
        for (var mbm in microblogs){
            sf.lookUpThing(microblogs[mbm]);
            if (kb.whether(microblogs[mbm], SIOC('topic'), theUser)){
                mbm_posts = mbm_posts.concat(kb.each(microblogs[mbm], SIOC('container_of')));
            }else{
                if (kb.whether(microblogs[mbm], RDF('type'), SIOCt('Microblog'))){
                    mbn_posts = mbn_posts.concat(kb.each(microblogs[mbm], SIOC('container_of')));
                }
            }
        }
        var postNotificationList= generatePostList(mbn_posts);
            postNotificationList.id = "postNotificationList";
            postNotificationList.className = "postList";
        postNotificationContainer.appendChild(postNotificationList);
        
        var postMentionList= generatePostList(mbm_posts);
            postMentionList.id = "postMentionList";
            postMentionList.className = "postList";
        postMentionContainer.appendChild(postMentionList);
        //NOTIFICATIONS VIEW END
        //POST INFORMATION END      
        
        //build
        var microblogPane  = doc.createElement("div");
            microblogPane.className = "ppane";
            microblogPane.appendChild(xviewReply);
            microblogPane.appendChild(xnotify);
            microblogPane.appendChild(headerContainer);
            if (xfollows != undefined){microblogPane.appendChild(xfollows);}
            microblogPane.appendChild(postContainer);
            microblogPane.appendChild(postNotificationContainer);
            microblogPane.appendChild(postMentionContainer);
        return microblogPane;
    }
}, true);
