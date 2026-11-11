// Wall-clock deadlines survive throttled tab timers. A foreground transition drains overdue work once.
export class DeadlineQueue{
 constructor({now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){this.now=now;this.schedule=schedule;this.cancel=cancel;this.jobs=new Set();}
 after(ms,fn,valid=()=>true){const job={at:this.now()+Math.max(0,ms),fn,valid};this.jobs.add(job);job.timer=this.schedule(()=>this.run(job),ms);job.timer?.unref?.();return job;}
 run(job){if(!this.jobs.delete(job))return;this.cancel(job.timer);if(job.valid())job.fn();}
 flush(){for(const job of [...this.jobs].sort((a,b)=>a.at-b.at))if(job.at<=this.now())this.run(job);}
 clear(){for(const job of this.jobs)this.cancel(job.timer);this.jobs.clear();}
}
