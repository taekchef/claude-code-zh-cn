#!/usr/bin/env node
// Extracted from @anthropic-ai/claude-code@2.1.112 package/cli.js.
// This fixture intentionally keeps only PR #10 high-risk dynamic text shapes.
var Eh6,JS4=`# Advisor Tool

You have access to an \`advisor\` tool backed by a stronger reviewer model. It takes NO parameters -- when you call advisor(), your entire conversation history is automatically forwarded.`;
let advisorDialog=z$.createElement(R1,{title:"Advisor Tool",onCancel:P},k);
let advisorCommand={type:"local-jsx",name:"advisor",description:"Configure the Advisor Tool to consult a stronger model for guidance at key moments during a task"};
let stopReview={label:"Stop ultrareview",value:"stop"};
function D$7(){return{kind:"needs-confirm",body:`This review bills as Extra Usage (${Au6()}).`,billingNote:K}}
function Z$7(){let D=A.trim()?`${A.trim()}\n`:"",Z=P?`\nScope: ${P}`:"";return{blocks:[{type:"text",text:`${D}Ultrareview launched for ${M} (${s_6()}, runs in the cloud). Track: ${W}${Z}`}]}}
